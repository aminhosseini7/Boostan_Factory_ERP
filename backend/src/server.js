require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

require('./config/database');

const errorHandler = require('./middleware/errorHandler');

const productRoutes = require('./modules/products/products.routes');

const app = express();

app.use(cors());
app.use(helmet());
app.use(express.json());

app.get('/api/health',(req,res)=>{
    res.json({
        project:'Boostan Factory ERP',
        version:'Phase 17.3',
        status:'running'
    });
});

app.use('/api/products', productRoutes);

app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT,()=>{
    console.log(`Boostan ERP API running on ${PORT}`);
});
