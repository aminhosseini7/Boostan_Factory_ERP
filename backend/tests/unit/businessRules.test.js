const test=require('node:test');const assert=require('node:assert/strict');const {defaultPaidAmount,ensurePaymentWithinTotal}=require('../../src/utils/businessRules');
test('cash defaults to full payment',()=>assert.equal(defaultPaidAmount('CASH',100),100));
test('credit defaults to zero',()=>assert.equal(defaultPaidAmount('CREDIT',100),0));
test('payment may not exceed total',()=>assert.equal(ensurePaymentWithinTotal(100,101),false));
test('valid partial payment',()=>assert.equal(ensurePaymentWithinTotal(100,40),true));
