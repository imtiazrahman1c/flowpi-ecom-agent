import {spawn} from 'node:child_process';
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','apps/web','--hostname','127.0.0.1','--port','3137'],{stdio:'ignore'});
try{
 let ready=false;for(let i=0;i<40;i++){try{await fetch('http://127.0.0.1:3137/api/health');ready=true;break;}catch{await new Promise(r=>setTimeout(r,250));}}
 if(!ready)throw Error('Server did not start');
 for(const [path,method] of [['/','GET'],['/api/health','GET'],['/api/workspace','GET'],['/api/w01','POST'],['/api/commerce','POST'],['/api/operations','POST'],['/api/reports','GET']]){
 const r=await fetch('http://127.0.0.1:3137'+path,{method,headers:{'Content-Type':'application/json'},...(method==='POST'?{body:'{}'}:{})});
 const expected=path==='/'||path==='/api/health'?200:401;
 if(r.status!==expected)throw Error(path+' expected '+expected+' got '+r.status);
 console.log(method,path,r.status,'PASS');
 }
}finally{server.kill('SIGTERM');}
