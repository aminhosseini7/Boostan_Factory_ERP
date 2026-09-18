const service = require('./products.service');

async function getProducts(req,res,next){
    try{
        const products = await service.listProducts();
        res.json(products);
    }catch(err){
        next(err);
    }
}

async function createProduct(req,res,next){
    try{
        const product = await service.addProduct(req.body);
        res.status(201).json(product);
    }catch(err){
        next(err);
    }
}

module.exports={
    getProducts,
    createProduct
};
