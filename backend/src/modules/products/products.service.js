const repository = require('../../repositories/product.repository');

async function listProducts(){
    return await repository.getAllProducts();
}

async function addProduct(data){
    return await repository.createProduct(data);
}

module.exports = {
    listProducts,
    addProduct
};
