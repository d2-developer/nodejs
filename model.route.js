
const express = require('express');
const router = express.Router();
const modelController = require('../controller/model.controller')
const authMiddleware = require('../../../middleware/authMiddleware')
module.exports = router;

router.get('/token',
    modelController.token)

router.post('/upload',
    // authMiddleware.Auth,
    modelController.upload)


router.post('/upload/media',
    // authMiddleware.Auth,
    modelController.uploadMedia)   
    
router.post('/add',
    modelController.add)    

router.get('/status',
    // authMiddleware.Auth,
    modelController.status)

router.get('/mediastatus',
    // authMiddleware.Auth,
    modelController.mediaStatus)    

    router.get('/htmlstatus',
    // authMiddleware.Auth,
    modelController.HTMLstatus)   

router.get('/html',
    // authMiddleware.Auth,
    modelController.readHTML)

router.post('/html1',
    // authMiddleware.Auth,
    modelController.writeHTML)

router.get('/upload',
    // authMiddleware.Auth,
    modelController.uploadsFolder)

router.post('/uploadhtml',
    modelController.uploadHTML)

router.post('/uploadVideo',
   // authMiddleware.Auth,
    modelController.uploadVideo)  

router.post('/uploadhtmlde',
    // authMiddleware.Auth,
    modelController.uploadHTMLDE)    

router.post('/status', modelController.updateStatus)


router.post('/upload/image',

    modelController.uploadImage)

router.get('/files',

    modelController.getFiles)

router.post('/update',
    modelController.updateModel)        

// NEW API's

router.post('/title/update',

    modelController.updateTitle)

router.get('/',
    // authMiddleware.Auth,
    modelController.model)

router.get('/active',
    // authMiddleware.Auth,
    modelController.modelActive)


router.get('/main/:model_id',
    // authMiddleware.Auth,
    modelController.mainModelById)      
    
router.get('/:id',
    // authMiddleware.Auth,
    modelController.modelById)    


router.post('/order', 
    modelController.updateOrder)     
    
router.delete('/main/:model_id',
modelController.mainModelDeleteById)   



