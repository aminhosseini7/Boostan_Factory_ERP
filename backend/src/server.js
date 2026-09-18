require('dotenv').config();
const express=require('express');
const cors=require('cors');
const helmet=require('helmet');
const sql=require('./config/database');
const {getEnv}=require('./config/env');
const {apiLimiter}=require('./middleware/rateLimits');
const notFound=require('./middleware/notFound');
const errorHandler=require('./middleware/errorHandler');

const app=express();
const env=getEnv();
app.set('trust proxy',1);
app.use(helmet());
app.use(cors({origin:(origin,cb)=>{if(!origin||origin===env.frontendUrl||/^http:\/\/localhost:\d+$/.test(origin))return cb(null,true);return cb(new Error('CORS origin not allowed'));},credentials:false}));
app.use(express.json({limit:'1mb'}));
app.use('/api',apiLimiter);

app.get('/api/health',async(req,res,next)=>{try{const r=await sql`SELECT NOW() AS now`;res.json({project:'Boostan Factory ERP',version:'1.0.0-rc.1',status:'running',database:'connected',time:r[0].now});}catch(e){next(e);}});

app.use('/api/auth',require('./modules/auth/auth.routes'));
app.use('/api/users',require('./modules/users/users.routes'));
app.use('/api/products',require('./modules/products/products.routes'));
app.use('/api/customers',require('./modules/customers/customers.routes'));
app.use('/api/production',require('./modules/production/production.routes'));
app.use('/api/sales',require('./modules/sales/sales.routes'));
app.use('/api/payments',require('./modules/payments/payments.routes'));
app.use('/api/inventory',require('./modules/inventory/inventory.routes'));
app.use('/api/dashboard',require('./modules/dashboard/dashboard.routes'));
app.use('/api/reports',require('./modules/reports/reports.routes'));
app.use('/api/activity',require('./modules/activity/activity.routes'));

app.use(notFound);
app.use(errorHandler);

const server=app.listen(env.port,()=>console.log(`Boostan ERP API running on port ${env.port}`));

async function shutdown(){try{server.close();await sql.end({timeout:5});}finally{process.exit(0);}}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
module.exports=app;
