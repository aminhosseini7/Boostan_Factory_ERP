const sql = require('../../config/database');

async function getAllProducts(){
    return await sql`
        SELECT * FROM products
        ORDER BY created_at DESC
    `;
}

async function createProduct(data){
    const {name, code, unit} = data;

    return await sql`
        INSERT INTO products(name, code, unit)
        VALUES(${name}, ${code}, ${unit})
        RETURNING *
    `;
}

module.exports = {
    getAllProducts,
    createProduct
};
