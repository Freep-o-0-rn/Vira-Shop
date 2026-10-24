import tls from "node:tls";
import { readFileSync, writeFileSync } from "node:fs";

const key=readFileSync(process.env.MOCK_SMTP_KEY);
const cert=readFileSync(process.env.MOCK_SMTP_CERT);
const output=process.env.MOCK_SMTP_MAIL_FILE;
if(!output)throw Error("Missing SMTP test outbox");
const server=tls.createServer({key,cert},socket=>{
 socket.setEncoding("utf8");
 socket.write("220 localhost test SMTP ready\r\n");
 let buf="",auth=0,bodyLines=[],inData=false,recipient="";
 const reply=(code,msg)=>socket.write(code+" "+msg+"\r\n");
 socket.on("data",data=>{
  buf+=data;
  let index;
  while((index=buf.indexOf("\n"))>=0){
   const line=buf.slice(0,index).replace(/\r$/,"");buf=buf.slice(index+1);
   if(inData){
    if(line==="."){
     const message=bodyLines.join("\n");
     const payload=/Content-Type: text\/plain; charset=UTF-8\nContent-Transfer-Encoding: base64\n\n([\s\S]*?)\n--vira_/i.exec(message)?.[1]?.replace(/\s/g,"")??"";
     const decoded=Buffer.from(payload,"base64").toString("utf8");
     const code=/(?:регистрации|удаления аккаунта) Vira Shop:\s*(\d{6})/.exec(decoded)?.[1];
     if(!code){reply("554","Missing verification code");continue;}
     writeFileSync(output,JSON.stringify({to:recipient,code,kind:decoded.includes("удаления аккаунта")?"delete":"signup"}),"utf8");
     bodyLines=[];inData=false;
     reply("250","Saved");
    }else bodyLines.push(line);
    continue;
   }
   if(/^EHLO /i.test(line))socket.write("250-localhost\r\n250 AUTH LOGIN\r\n");
   else if(line==="AUTH LOGIN"){auth=1;reply("334","VXNlcm5hbWU6");}
   else if(auth===1){auth=2;reply("334","UGFzc3dvcmQ6");}
   else if(auth===2){auth=0;reply("235","Authenticated");}
   else if(/^MAIL FROM:/i.test(line))reply("250","Sender accepted");
   else if(/^RCPT TO:/i.test(line)){recipient=line.slice(9).replace(/[<>]/g,"");reply("250","Recipient accepted");}
   else if(line==="DATA"){inData=true;reply("354","End with dot");}
   else if(line==="QUIT"){reply("221","Bye");socket.end();}
   else reply("500","Invalid command");
  }
 });
});
server.listen(1465,"127.0.0.1",()=>{console.log("SMTP test fixture listening");});
