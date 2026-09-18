require('dotenv').config();
const bcrypt=require('bcryptjs');
const sql=require('../src/config/database');

(async()=>{
 try{
  const username=process.env.MANAGER_USERNAME||'manager';
  const password=process.env.MANAGER_PASSWORD;
  const fullName=process.env.MANAGER_FULL_NAME||'Factory Manager';
  if(!password||password.length<8) throw new Error('Set MANAGER_PASSWORD in .env (minimum 8 characters)');
  const existing=await sql`SELECT id FROM users WHERE username=${username}`;
  if(existing.length){console.log(`Manager/user '${username}' already exists.`);return;}
  const hash=await bcrypt.hash(password,12);
  const r=await sql`INSERT INTO users(username,full_name,password_hash,role) VALUES(${username},${fullName},${hash},'MANAGER') RETURNING id,username,full_name,role`;
  console.log('Manager created:',r[0]);
 }catch(e){console.error(e.message);process.exitCode=1;}finally{await sql.end({timeout:5});}
})();
