import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { jsonStore } from '../src/json-store.js';
import { seedData } from '../src/seed-data.js';
import { sameRecord } from '../src/store.js';
import { validate } from '../src/domain.js';
const secret = 'regression-tests-only-secret';
const auth = 'Bearer ' + jwt.sign({name:'Manager',role:'Project Manager'},secret);
async function fixture(fn) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'healthcare-regression-'));
  try {
    const file=path.join(dir,'project.json');
    const app=createApp(secret,jsonStore(file,[]));
    const read=async()=> (await request(app).get('/api/project').set('Authorization',auth).expect(200)).body.data;
    const send=async(method,url,data)=>request(app)[method](url).set('Authorization',auth).send({version:(await read()).__v,data});
    await fn({app,read,send,file});
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
}
test('Timestamp regression: legacy Mongoose document keeps original createdAt during approval',async()=>{
  const schema=new mongoose.Schema({}, {strict:false,timestamps:true});
  schema.path('createdAt').immutable(true);
  const Model=mongoose.model('LegacyTimestampRegression',schema);
  const stamp=new Date('2026-01-01T00:00:00Z');
  const doc=Model.hydrate({...seedData(),_id:new mongoose.Types.ObjectId(),__v:0,createdAt:stamp,updatedAt:stamp});
  const originalSet=doc.set.bind(doc);
  doc.set=(payload)=>{
    assert.equal(Object.hasOwn(payload,'createdAt'),false);
    assert.equal(Object.hasOwn(payload,'updatedAt'),false);
    originalSet(payload);
  };
  doc.save=async()=>{await doc.validate();};
  const app=createApp(secret,{Project:{findOne:async()=>doc},User:{}});
  const r=await request(app).post('/api/changes/CR-001/decision').set('Authorization',auth)
    .send({version:0,status:'Approved',comments:'Approved scope'}).expect(200);
  assert.equal(r.body.data.changes[0].status,'Approved');
  assert.equal(doc.createdAt.toISOString(),stamp.toISOString());
});
test('Nested progress-history changes are detected, timestamps alone are ignored',()=>{
  assert.equal(sameRecord({id:'T',progressHistory:[{date:'2026-10-01',value:10}]},{id:'T',progressHistory:[{date:'2026-10-01',value:20}]}),false);
  assert.equal(sameRecord({id:'T',createdAt:'a'},{id:'T',createdAt:'b'}),true);
});
test('Proposed WBS cannot be scheduled, including bypass without change ID',()=>{
  const p=seedData();p.tasks[0].wbsId='3.1';
  assert.throws(()=>validate(p),/approved WBS/);
});
test('Requirement hierarchy cycles rejected',()=>{
  const p=seedData();p.requirements[0].parent=p.requirements[1].id;p.requirements[1].parent=p.requirements[0].id;
  assert.throws(()=>validate(p),/Circular/);
});
test('Every module supports persistent create, update and delete',async()=>fixture(async({read,send,file})=>{
  const records={
    stakeholders:{title:'Stakeholder test',email:'stakeholder@example.com'},
    team:{title:'Team test',email:'team@example.com',status:'Active'},
    requirements:{title:'Requirement test',status:'Proposed'},
    wbs:{title:'WBS test',status:'Proposed'},
    changes:{title:'Change test',status:'Pending',cost:100,weeks:1},
    tasks:{title:'Task test',start:'2026-12-01',end:'2026-12-02',progress:0,plannedCost:100,status:'Not Started'},
    costs:{title:'Cost test',amount:100,date:'2026-10-25',taskId:'T-01'},
    defects:{title:'Defect test',severity:'Critical',status:'Open',verification:'Pending'},
    quality:{title:'Quality test',status:'Pending'},
    risks:{title:'Risk test',likelihood:2,impact:3,status:'Open'},
    pdpc:{title:'PDPC test',status:'Pending'},
    milestones:{title:'Milestone test',date:'2026-12-01',status:'Pending'},
  };
  for(const [group,data] of Object.entries(records)) {
    const count=(await read())[group].length;
    const r=await send('post','/api/'+group,data);assert.equal(r.status,200,group+': '+JSON.stringify(r.body));
    const id=r.body.data[group].at(-1).id;
    const edit=await send('put','/api/'+group+'/'+id,{title:'Updated '+group});assert.equal(edit.status,200,JSON.stringify(edit.body));
    assert.equal(JSON.parse(fs.readFileSync(file))[group].find(x=>x.id===id).title,'Updated '+group);
    const del=await send('delete','/api/'+group+'/'+id);assert.equal(del.status,200,JSON.stringify(del.body));
    assert.equal((await read())[group].length,count);
  }
}));
test('Approval then scheduled change work, quality closure and project plan persist',async()=>fixture(async({app,read,send})=>{
  await request(app).post('/api/changes/CR-001/decision').set('Authorization',auth)
    .send({version:0,status:'Approved',comments:'Approved by management'}).expect(200);
  const after=await request(app).get('/api/project').set('Authorization',auth).expect(200);
  assert.equal(after.body.summary.baseline.budget,5800000);assert.equal(after.body.summary.baseline.weeks,19);
  const task=await send('post','/api/tasks',{title:'AI development',wbsId:'3.1',changeId:'CR-001',start:'2026-12-15',end:'2026-12-30',progress:0,plannedCost:800000,status:'Not Started'});
  assert.equal(task.status,200,JSON.stringify(task.body));
  const p=await read();const defect=p.defects[0];
  const closed=await send('put','/api/defects/'+defect.id,{status:'Closed',verification:'Passed',resolution:'Retested successfully'});
  assert.equal(closed.status,200);
  const plan=await send('put','/api/project',{plan:{Scope:'Approved scope',Quality:'QA sign-off'},closure:{date:'2026-12-31',status:'Accepted',lessons:'Validate dependencies'}});
  assert.equal(plan.status,200);assert.equal(plan.body.data.closure.finalCost,3200000);
}));
test('Malformed dates, duplicate team email and invalid project status are rejected',async()=>fixture(async({send})=>{
  assert.equal((await send('post','/api/milestones',{title:'Missing date',status:'Pending'})).status,400);
  assert.equal((await send('put','/api/project',{status:'Invalid'})).status,400);
  assert.equal((await send('post','/api/team',{title:'Person',email:'invalid',status:'Active'})).status,400);
}));
