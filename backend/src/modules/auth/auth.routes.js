const router = require('express').Router();

router.post('/login',(req,res)=>{
    res.json({
        message:'Auth module foundation ready'
    });
});

module.exports = router;
