require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(cors());
app.use(helmet());
app.use(express.json());

app.get('/api/health', (req,res)=>{
    res.json({
        project:'Boostan Factory ERP',
        version:'Phase 17.1',
        status:'running'
    });
});

app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, ()=>{
    console.log(`Boostan ERP API running on port ${PORT}`);
});
