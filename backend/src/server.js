require('dotenv').config();
const express=require('express');
const cors=require('cors');
const helmet=require('helmet');

const app=express();

app.use(cors());
app.use(helmet());
app.use(express.json());

app.get('/api/health',(req,res)=>{
 res.json({
  project:'Boostan Factory ERP',
  status:'running'
 });
});

app.listen(process.env.PORT || 5000,()=>{
 console.log('Boostan ERP Backend running');
});
