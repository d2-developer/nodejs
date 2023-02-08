
//core imports
const moment = require('moment');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs')
var uniqid = require('uniqid');
var unzip = require('unzipper');
var path = require('path');
const { Model } = require('../model/model.model');
const { ModelList } = require('../model/model.data');
const extract = require('extract-zip')

const AWS = require('aws-sdk');
const { title } = require('process');
var mv = require('mv');
// var fs = require('fs-extra');
var spawn = require('child_process').execSync;
const mvdir = require('mvdir');
const util = require('util')
var rimraf = require("rimraf");
require('dotenv').config()
const removeDirectory = require('@amindunited/remove-directory');

let uploads = {};
/* Token generation */
module.exports.token = async(req, res) => {
    const token = jwt.sign({
        _id: Math.floor(10000 + Math.random() * 90000)
    }, process.env.JWT_SECRET_KEY, {
        // expiresIn: 604800 // 1 week, 
    })
    res.status(200).json({ success: true, message: token });
}

/* Add model with title */
module.exports.add = async (req, res) => {
    var title = "";
    var languages = req.body.languages;
    var userId = req.body.userId;
    console.log("user>>>", userId)
    const checkModel = await ModelList.findOne({ title: req.body.title });
    if(checkModel){
        res.send({ status:false, message:"Title already in use"});
        res.end();
    }else{
        let order1 = 0;
        const getOrder =  await Model.findOne().sort({order:1}).limit(1) ;
        if(getOrder){
            console.log("order111>>>", getOrder['order']);
            order1 = getOrder['order']-1;
        }
        console.log("order>>>", order1);
        const model = await Model.create({ updatedBy: userId, order: order1});
        const saveModel = await model.save();
        languages.map(async (lang, index) => {
            console.log("user>>>", userId)
            if(lang=="en")
                title = req.body.title;
            else
                title = ""    
            
            
            const modelList = await ModelList.create({                        
                model: saveModel['_id'],
                title: title,
                language: lang,
                updatedBy: userId
            });
            
            const saveModelData = modelList.save();
        })

        
        res.send({ status:true, message:""});
        res.end();
    }
}

/* Upload 3d model with zip */
module.exports.upload = async (req, res) => {
    let fileId = req.headers["x-file-id"];
    let startByte = parseInt(req.headers["x-start-byte"], 10);
    let name = req.headers["name"];
    let userId = req.headers['user_id'];
    let extention = req.headers["name"].split('.').pop();
    // let finalname= req.headers["title"] +'.'+ extention
    let fileSize = parseInt(req.headers["size"], 10);
    let model_id  = req.headers["model_id"];
    if (uploads[fileId] && fileSize == uploads[fileId].bytesReceived) {
        res.end();
        return;
    }

    model_tmp_folder = uniqid();
    const model = await Model.findOne({ _id: model_id });
    if(model.model_folder){
        model_title = model.model_folder ;
        
    }
    else{
        model_title = "";
    }

    let finalname=  model_tmp_folder +'.'+ extention    

    if (!fileId) {
        res.writeHead(400, "No file id");
        res.end(400);
    }
    console.log(uploads[fileId]);
    if (!uploads[fileId]) uploads[fileId] = {};

    let upload = uploads[fileId];
    let fileStream;

    if (!startByte) {
        upload.bytesReceived = 0;
        let name = req.headers["name"];
        console.log("name>>>>", name)
        fileStream = fs.createWriteStream(process.env.UPLOAD_PATH+`${finalname}`, {
            flags: "w",
        });
    } else {
        if (upload.bytesReceived != startByte) {
            res.writeHead(400, "Wrong start byte");
            res.end(upload.bytesReceived);
            return;
        }
        // append to existing file
        fileStream = fs.createWriteStream(process.env.UPLOAD_PATH+`${finalname}`, {
            flags: "a",
        });
    }

    req.on("data", function(data) {
        console.log("bytes received", upload.bytesReceived);
        upload.bytesReceived += data.length;
    });

    console.log("-------------------------------------------");
    req.pipe(fileStream);


    // when the request is finished, and all its data is written
    fileStream.on("close", async function() {
        console.log(upload.bytesReceived, fileSize);
        if (upload.bytesReceived == fileSize) {

            console.log("Upload finished");
            delete uploads[fileId];

            const dir = process.env.UPLOAD_PATH+`${model_tmp_folder}`;
            const dir1 = process.env.UPLOAD_PATH+`${model_title}`;
            !fs.existsSync(dir) && fs.mkdirSync(dir);
            console.log("dir>>>>", dir)
            var unzip1= await fs.createReadStream(process.env.UPLOAD_PATH+`${finalname}`).pipe(unzip.Extract({ path: dir }));
            unzip1.on('finish',async function () { 
                
                fs.unlinkSync(process.env.UPLOAD_PATH+`${finalname}`);
                console.log("dir>>>>", dir)

                if(model_title !="" && fs.existsSync(dir1)){
                    await removeDirectory(dir1)
                    .then(() => {
                        console.log("deleted")
                        // ... continue
                    }, (err) => {
                        console.log("deleted")
                        // ... Oh no, you got an error!
                    })
                }

                let filenames = fs.readdirSync(dir);
                let fileName = ""
                let hdrFileName =""
                let controlFile =""
                console.log("fileNames>>>>", filenames);
                await filenames.forEach(function (file) {
                    // Do whatever you want to do with the file
                    if(path.extname(file)==".gltf"){
                        fileName = file;
                    } 
                    if(path.extname(file)==".hdr"){
                        hdrFileName = file;
                    } 
                    if(path.extname(file)==".xml"){
                        controlFile = file;
                    } 
                });
                const model = await Model.updateOne({ _id: model_id }, { $set: {model: fileName, path: 'assets/model/'+model_tmp_folder,environmentFile: hdrFileName,controlFile:controlFile, model_folder: model_tmp_folder, updatedBy: userId }});

                res.send({ status:true});
                res.end();

            //  });

            });
        } else {
            // connection lost, we leave the unfinished file around
            console.log("File unfinished, stopped at " + upload.bytesReceived);
            res.writeHead(500, "Server Error");
            res.end();
        }
    });

    // in case of I/O error - finish the request
    fileStream.on("error", function(err) {
        console.log("fileStream error", err);
        res.writeHead(500, "File error");
        res.end();
    });

}



/* Upload model manual html*/
module.exports.uploadHTML = async (req, res) => {
    let fileId = req.headers["x-file-id"];
    let startByte = parseInt(req.headers["x-start-byte"], 10);
    let name = req.headers["name"];
    let model_id = req.headers["model_id"];
    let extention = req.headers["name"].split('.').pop();
    let userId = req.headers['user_id'];
    // GET THE TITLE
    const model = await ModelList.findOne({ _id: model_id });
    model_tmp_folder = uniqid();
    if(model.html){
        model_title = model.html ;
    } else{
        model_title = "";
    }    
    let finalname=  model_tmp_folder +'.'+ extention
    let fileSize = parseInt(req.headers["size"], 10);
    if (uploads[fileId] && fileSize == uploads[fileId].bytesReceived) {
        res.end();
        return;
    }

    if (!fileId) {
        res.writeHead(400, "No file id");
        res.end(400);
    }
    if (!uploads[fileId]) uploads[fileId] = {};

    let upload = uploads[fileId];
    let fileStream;

    if (!startByte) {
        upload.bytesReceived = 0;
        let name = req.headers["name"];
        fileStream = fs.createWriteStream(process.env.UPLOAD_HTML_PATH+`${finalname}`, {
            flags: "w",
        });
    } else {
        if (upload.bytesReceived != startByte) {
            res.writeHead(400, "Wrong start byte");
            res.end(upload.bytesReceived);
            return;
        }
        // append to existing file
        fileStream = fs.createWriteStream(process.env.UPLOAD_HTML_PATH+`${finalname}`, {
            flags: "a",
        });
    }

    req.on("data", function(data) {
        // console.log("bytes received", upload.bytesReceived);
        upload.bytesReceived += data.length;
    });

    // console.log("-------------------------------------------");


    //req is a readable stream so read from it 
    //and whatever data we got from reading provide it to 
    // writable stream which is fileStream, so read data from req Stream and then write in fileStream 
    req.pipe(fileStream);
    


    // when the request is finished, and all its data is written
    fileStream.on("close", async function() {
        // console.log(upload.bytesReceived, fileSize);
        if (upload.bytesReceived == fileSize) {

            // fs.createReadStream(`./uploads/${name}`).pipe(unzipper.Extract({ path: 'uploads/pathaa' }));


            // console.log("Upload finished");
            delete uploads[fileId];

            

            const dir = process.env.UPLOAD_HTML_PATH+`${model_tmp_folder}`;
            const dir1 = process.env.UPLOAD_HTML_PATH+`${model_title}`;
            !fs.existsSync(dir) && fs.mkdirSync(dir);
            console.log("dir>>>>", dir)
        
            var unzip1= await fs.createReadStream(process.env.UPLOAD_HTML_PATH+`${finalname}`).pipe(unzip.Extract({ path: dir }));
            unzip1.on('finish',async function () { 
                
                fs.unlinkSync(process.env.UPLOAD_HTML_PATH+`${finalname}`);
                console.log("dir>>>>", dir)

                if(model_title !="" && fs.existsSync(dir1)){
                    await removeDirectory(dir1)
                    .then(() => {
                        console.log("deleted")
                        // ... continue
                    }, (err) => {
                        console.log("deleted")
                        // ... Oh no, you got an error!
                    })
                }
                

                await ModelList.updateOne({ _id: model_id }, { $set: {path: 'assets/html/'+`${model_tmp_folder}`, html: model_tmp_folder, updatedBy: userId}});
                
                    res.send({ status:"Step 2 Completed", id: model_id });
                    res.end();
            });
        } else {
            // connection lost, we leave the unfinished file around
            console.log("File unfinished, stopped at " + upload.bytesReceived);
            res.writeHead(500, "Server Error");
            res.end();
        }
    });

    // in case of I/O error - finish the request
    fileStream.on("error", function(err) {
        console.log("fileStream error", err);
        res.writeHead(500, "File error");
        res.end();
    });

}


/* Upload description videos */
module.exports.uploadVideo = async (req, res) => {
    
    let fileId = req.headers["x-file-id"];
    let startByte = parseInt(req.headers["x-start-byte"], 10);
    let name = req.headers["name"];
    let model_id = req.headers["model_id"];
    let extention = req.headers["name"].split('.').pop();
    let userId = req.headers['user_id'];
    // GET THE TITLE
    const model = await ModelList.findOne({ _id: model_id });

    let fileSize = parseInt(req.headers["size"], 10);
    console.log("uploads[fileId]",uploads[fileId])
    if (uploads[fileId] && fileSize == uploads[fileId].bytesReceived) {
        res.end();
        return;
    }

    if (!fileId) {
        res.writeHead(400, "No file id");
        res.end(400);
    }
    if (!uploads[fileId]) uploads[fileId] = {};

    let upload = uploads[fileId];
    let fileStream;

    if (!startByte) {
        upload.bytesReceived = 0;
        let name = req.headers["name"];
        
        fileStream = fs.createWriteStream(process.env.UPLOAD_VIDEO_PATH+name, {
            flags: "w",
        });
    } else {
        if (upload.bytesReceived != startByte) {
            res.writeHead(400, "Wrong start byte"); 
            res.end(upload.bytesReceived);
            return;
        } 
    }

    req.on("data", function(data) {
        upload.bytesReceived += data.length;
    });

    req.pipe(fileStream);
    res.send({ status:"Step 2 Completed", id: model_id });
    res.end();
    // in case of I/O error - finish the request
    fileStream.on("error", function(err) {
        console.log("fileStream error", err);
        res.writeHead(500, "File error");
        res.end();
    });

}

/** @Function Upload Model html  */
module.exports.uploadHTMLDE = async (req, res) => {
   
    let fileId = req.headers["x-file-id"];
    let startByte = parseInt(req.headers["x-start-byte"], 10);
    let name = req.headers["name"];
    let model_id = req.headers["model_id"];

    let extention = req.headers["name"].split('.').pop();
    console.log("extention>>>>", extention)
    let finalname= req.headers["title"] +'.'+ extention
    let fileSize = parseInt(req.headers["size"], 10);
    console.log("file Size", fileSize, fileId, startByte);
    if (uploads[fileId] && fileSize == uploads[fileId].bytesReceived) {
        res.end();
        return;
    }

    console.log(fileSize);

    if (!fileId) {
        res.writeHead(400, "No file id");
        res.end(400);
    }
    console.log(uploads[fileId]);
    if (!uploads[fileId]) uploads[fileId] = {};

    let upload = uploads[fileId];
    let fileStream;

    if (!startByte) {
        upload.bytesReceived = 0;
        let name = req.headers["name"];
        console.log("name>>>>", name)
        fileStream = fs.createWriteStream(process.env.UPLOAD_HTML_PATH+`${finalname}`, {
            flags: "w",
        });
    } else {
        if (upload.bytesReceived != startByte) {
            res.writeHead(400, "Wrong start byte");
            res.end(upload.bytesReceived);
            return;
        }
        // append to existing file
        fileStream = fs.createWriteStream(process.env.UPLOAD_HTML_PATH+`${finalname}`, {
            flags: "a",
        });
    }

    req.on("data", function(data) {
        console.log("bytes received", upload.bytesReceived);
        upload.bytesReceived += data.length;
    });

     req.pipe(fileStream);
    fileStream.on("close", async function() {
        console.log(upload.bytesReceived, fileSize);
        if (upload.bytesReceived == fileSize) {
            console.log("Upload finished");
            delete uploads[fileId];

            const dir = process.env.UPLOAD_HTML_PATH+`${req.headers["title"]}`;
            !fs.existsSync(dir) && fs.mkdirSync(dir);
            console.log("dir>>>>", dir)
            var unzip1= await fs.createReadStream(process.env.UPLOAD_HTML_PATH+`${finalname}`).pipe(unzip.Extract({ path: dir }));
            unzip1.on('finish',async function () { 
                
                fs.unlinkSync(process.env.UPLOAD_HTML_PATH+`${finalname}`);
                
                await Model.updateOne({ _id: model_id }, { $set: {title_de: `${req.headers["title"]}`  ,html_de:'assets/html/'+`${req.headers["title"]}`, step3: true}});
                 
                    res.send({ status:"Step 3 Completed" });
                    res.end();

            //  });

            });
        } else {
            // connection lost, we leave the unfinished file around
            console.log("File unfinished, stopped at " + upload.bytesReceived);
            res.writeHead(500, "Server Error");
            res.end();
        }
    });

    // in case of I/O error - finish the request
    fileStream.on("error", function(err) {
        console.log("fileStream error", err);
        res.writeHead(500, "File error");
        res.end();
    });
}

/** @Function Upload Media  */
module.exports.uploadMedia = async (req, res) => {
    let fileId = req.headers["x-file-id"];
    let startByte = parseInt(req.headers["x-start-byte"], 10);
    let name = req.headers["name"];
    let extention = req.headers["name"].split('.').pop();
    let finalname= uniqid() +'.'+ extention
    let fileSize = parseInt(req.headers["size"], 10);
    if (uploads[fileId] && fileSize == uploads[fileId].bytesReceived) {
        res.end();
        return;
    }


    if (!fileId) {
        res.writeHead(400, "No file id");
        res.end(400);
    }
    console.log(uploads[fileId]);
    if (!uploads[fileId]) uploads[fileId] = {};

    let upload = uploads[fileId];
    let fileStream;

    if (!startByte) {
        upload.bytesReceived = 0;
        let name = req.headers["name"];
        console.log("name>>>>", name)
        fileStream = fs.createWriteStream(process.env.UPLOAD_MEDIA_PATH+`${finalname}`, {
            flags: "w",
        });
    } else {
        if (upload.bytesReceived != startByte) {
            res.writeHead(400, "Wrong start byte");
            res.end(upload.bytesReceived);
            return;
        }
        // append to existing file
        fileStream = fs.createWriteStream(process.env.UPLOAD_MEDIA_PATH+`${finalname}`, {
            flags: "a",
        });
    }

    req.on("data", function(data) {
        console.log("bytes received", upload.bytesReceived);
        upload.bytesReceived += data.length;
    });

    console.log("-------------------------------------------");


    //req is a readable stream so read from it 
    //and whatever data we got from reading provide it to 
    // writable stream which is fileStream, so read data from req Stream and then write in fileStream 
    req.pipe(fileStream);


    // when the request is finished, and all its data is written
    fileStream.on("close", async function() {
        console.log(upload.bytesReceived, fileSize);
        if (upload.bytesReceived == fileSize) {

            // fs.createReadStream(`./uploads/${name}`).pipe(unzipper.Extract({ path: 'uploads/pathaa' }));


            console.log("Upload finished");
           
                    res.send({ status: "uploaded" });
                    res.end();

            //  });

            
        } else {
            // connection lost, we leave the unfinished file around
            console.log("File unfinished, stopped at " + upload.bytesReceived);
            res.writeHead(500, "Server Error");
            res.end();
        }
    });

    // in case of I/O error - finish the request
    fileStream.on("error", function(err) {
        console.log("fileStream error", err);
        res.writeHead(500, "File error");
        res.end();
    });


}

/** @Function Model uploaded Status  */
module.exports.status = async(req, res) => {
    //console.log('came');
    let fileId = req.headers["x-file-id"];
    let name = req.headers["name"];
    let fileSize = parseInt(req.headers["size"], 10);
    console.log(name);
    if (name) {
        try {
            let stats = fs.statSync(process.env.UPLOAD_PATH + name);
            if (stats.isFile()) {
                console.log(
                    `fileSize is ${fileSize} and already uploaded file size ${stats.size}`
                );
                if (fileSize == stats.size) {
                    res.send({ status: "file is present", uploaded: stats.size });
                    return;
                }
                if (!uploads[fileId]) uploads[fileId] = {};
                console.log(uploads[fileId]);
                uploads[fileId]["bytesReceived"] = stats.size;
                console.log(uploads[fileId], stats.size);
            }
        } catch (er) {}
    }
    let upload = uploads[fileId];
    if (upload) res.send({ uploaded: upload.bytesReceived });
    else res.send({ uploaded: 0 });
}

/** @Function uploaded Html manual status  */
module.exports.HTMLstatus = async(req, res) => {
    //console.log('came');
    let fileId = req.headers["x-file-id"];
    let name = req.headers["name"];
    let fileSize = parseInt(req.headers["size"], 10);
    console.log(name);
    if (name) {
        try {
            let stats = fs.statSync(process.env.UPLOAD_HTML_PATH + name);
            if (stats.isFile()) {
                console.log(
                    `fileSize is ${fileSize} and already uploaded file size ${stats.size}`
                );
                if (fileSize == stats.size) {
                    res.send({ status: "file is present", uploaded: stats.size });
                    return;
                }
                if (!uploads[fileId]) uploads[fileId] = {};
                console.log(uploads[fileId]);
                uploads[fileId]["bytesReceived"] = stats.size;
                console.log(uploads[fileId], stats.size);
            }
        } catch (er) {}
    }
    let upload = uploads[fileId];
    if (upload) res.send({ uploaded: upload.bytesReceived });
    else res.send({ uploaded: 0 });
}


/** @Function uploaded media status  */
module.exports.mediaStatus = async(req, res) => {
    //console.log('came');
    let fileId = req.headers["x-file-id"];
    let name = req.headers["name"];
    let fileSize = parseInt(req.headers["size"], 10);
    console.log(name);
    if (name) {
        try {
            let stats = fs.statSync(process.env.UPLOAD_MEDIA_PATH + name);
            if (stats.isFile()) {
                console.log(
                    `fileSize is ${fileSize} and already uploaded file size ${stats.size}`
                );
                if (fileSize == stats.size) {
                    res.send({ status: "file is present", uploaded: stats.size });
                    return;
                }
                if (!uploads[fileId]) uploads[fileId] = {};
                console.log(uploads[fileId]);
                uploads[fileId]["bytesReceived"] = stats.size;
                console.log(uploads[fileId], stats.size);
            }
        } catch (er) {}
    }
    let upload = uploads[fileId];
    if (upload) res.send({ uploaded: upload.bytesReceived });
    else res.send({ uploaded: 0 });
}


/** @Function get uploading status  */
module.exports.readHTML = async(req, res) => {
    var url = req.query.url;
    var data = "";
    console.log("url>>>>", process.env.UPLOAD_HTML_PATH + url)
    if(url.includes('.'))
        url = url;
    else
        url = url +"/index.html";    
    var readStream = fs.createReadStream(process.env.UPLOAD_HTML_PATH    + url, 'utf8');

    readStream.on('data', function(chunk) {
        data += chunk;
    }).on('end', function() {
        return res.send(data);
    });
}

/** @Function update html content  */
module.exports.writeHTML = async(req, res) => {
    var url = req.body.url;
    if(url.includes('.'))
        url = url;
    else
        url = url +"/index.html";   

    
    fs.writeFile(process.env.UPLOAD_HTML_PATH + url, req.body.html_data, async (err) => {
        if (err) {
            console.log(err);
            return res.send({ "success": err });
        } else {
            const result = await ModelList.updateOne({ _id: req.body.id }, { $set: {updatedBy: `${req.body.userId}` }});
            console.log("File written successfully\n");
            return res.send({ "success": "true" });
        }
    });
}

module.exports.uploadsFolder = async(req, res) => {
    return "http://127.0.0.1:8000/html/model/OMNI_Service_Manual.html";
    // res.sendFile(path.dirname(require.main.filename) + '/uploads/html/model/OMNI_Service_Manual.html');
}

/** @Function upload html content image  */
module.exports.uploadImage = async(req, res) => {
    let sampleFile;
    let uploadPath;

    if (!req.files || Object.keys(req.files).length === 0) {
        return res.status(400).send('No files were uploaded.');
    }

    sampleFile = req.files.upload;
    uploadPath = '../frontend/src/assets/uploads/' + sampleFile.name;

    sampleFile.mv(uploadPath, function(err) {
        if (err)
            return res.status(500).send(err);
        console.log("aa>>>>>", process.env.APP_URL + `assets/uploads/` + sampleFile.name)
        res.status(200).send({
                "status": true,
                "uploaded": true,
                "originalName": sampleFile.name,
                "generatedName": sampleFile.name,
                "msg": "Image upload successful",
                "imageUrl": process.env.APP_URL + `assets/uploads/` + sampleFile.name,
                "url": process.env.APP_URL + `assets/uploads/` + sampleFile.name
            })
            // res.send('File uploaded!');
    });
}

/** @Function get control files  */
module.exports.getFiles = async(req, res) => {
    var finalImages = [];
    var dir = '../frontend/src/assets/uploads/';
    console.log("dir>>>", dir);
    //
    fs.readdir(dir, function(err, files) {
        files = files.map(function(fileName) {
                return {
                    name: fileName,
                    time: fs.statSync(dir + '/' + fileName).mtime.getTime()
                };
            })
            .sort(function(a, b) {
                return a.time - b.time;
            })
            .map(function(v) {
                // return v.name;
                imgObj = {}
                imgObj.name = v.name;
                imgObj.time = v.time;
                imgObj.url =  process.env.APP_URL+ "assets/uploads/" + v.name;
                console.log(imgObj.url)
                imgObj.extension = getExtension(v.name);
                console.log("extenstion>>>",imgObj.extension)
                finalImages.push(imgObj);
            });

        return res.send({ "success": finalImages });
    });
}

/** @Function get model data  */
module.exports.model = async (req, res) => {
     // const model = await Model.find({ status: true });
     const model = await Model.aggregate([
        {
            $lookup: {
                from: "model_lists",
                localField: "_id",
                foreignField: "model",
                as: "data"
            }
            
        }, 
        {
            $unwind: {
              path: "$data",
              preserveNullAndEmptyArrays: true
            }
          },
        
        {
            $lookup: {
                from: "users",
                localField: "data.updatedBy",
                foreignField: "_id",
                as: "data.updatedBy"
            }
        },{
            $unwind: {
              path: "$data.updatedBy",
              preserveNullAndEmptyArrays: true
            }
          },
        
          {
            $lookup: {
                from: "users",
                localField: "updatedBy",
                foreignField: "_id",
                as: "updatedBy"
            }
        },{
            $unwind: {
              path: "$updatedBy",
              preserveNullAndEmptyArrays: true
            }
          },
        

          {$group : { _id: '$_id', "model": { "$first": "$model" },"model_folder" :{"$first": "$model_folder"}, "path"  :{"$first": "$path"}, "environmentFile"  :{"$first": "$environmentFile"}, "controlFile"  :{"$first": "$controlFile"}, "status"  :{"$first": "$status"}, "order"  :{"$first": "$order"},  "aspect"  :{"$first": "$aspect"}, "near"  :{"$first": "$near"}, "fov": { "$first": "$fov" }, "far"  :{"$first": "$far"}, "xPosition"  :{"$first": "$xPosition"}, "yPosition": { "$first": "$yPosition" }, "zPosition": { "$first": "$zPosition" }, "zControl": { "$first": "$zControl" }, "yControl": { "$first": "$yControl" }, "xControl": { "$first": "$xControl" }, "createdAt": { "$first": "$createdAt" }, "updatedAt": { "$first": "$updatedAt" }, "updatedBy": { "$first": "$updatedBy" }, data: { $push: '$data' } }},
          { $unset: ["updatedBy.password" ,"updatedBy.isAdmin", "data.updatedBy.password", "data.updatedBy.isAdmin"] }

        
        
    ]).sort({ order: 1 });
    console.log("model>>>>", model)
    if (model) {
        return res.status(200).json({ success: true, message: '', data: model });
        
    }else{
        return res.status(200).json({ success: false, message: '', data: [] });
    }
}

/** @Function get model data by id */
module.exports.modelById = async (req, res) => {
    let id = req.params.id
    const model = await ModelList.findOne({ _id: id });
    if (model) {
        return res.status(200).json({ success: true, message: '', data: model });
    }else{
        return res.status(200).json({ success: false, message: '', data: [] });
    }
}

/** @Function get model with all data by id */
module.exports.mainModelById = async (req, res) => {
    let id = req.params.model_id
    
    const model = await Model.aggregate([
        {
            $match: { _id: mongoose.Types.ObjectId(id)}
        },
        {
            $lookup: {
                from: "model_lists",
                localField: "_id",
                foreignField: "model",
                as: "data"
            }
            
        }
    ]);
    
    if (model) {
        return res.status(200).json({ success: true, message: '', data: model });
        
    }else{
        return res.status(200).json({ success: false, message: '', data: [] });
    }
}


/** @Function update title for model */
module.exports.updateTitle = async (req, res) => {
    // CHECK if already exists or not
    const checkModel = await ModelList.findOne({_id: {$ne: req.body.id},  title: req.body.title });
    if(checkModel){
        res.send({ status:false, message:"Title Already in use" }); 
        res.end();
    }else{
        const result = await ModelList.updateOne({ _id: req.body.id }, { $set: {title: `${req.body.title}`, updatedBy: `${req.body.userId}` }});
        if(result)                
            res.send({ status:true, message:"" });
        else
            res.send({ status:false, message:"Some Error Occured" }); 
        res.end();
   
    }
}

/** @Function update model files or replace */
module.exports.updateModel = async (req, res) => {
     let data= req.body.data;
     let id = req.body.id;
     const result = await Model.updateOne({ _id: id }, { $set: {xPosition: data['xPosition'], yPosition: data['yPosition'], zPosition: data['zPosition'], xControl: data['xControl'], yControl: data['yControl'], zControl: data['zControl'] }});
    if(result)                
        res.send({ status:true });
    else
        res.send({ status:false }); 
    res.end();

}

/** @Function update model list order */
module.exports.updateOrder = async (req, res) => {
    let data= req.body.data;
    if(data.length>0){
        for (let i=0; i< data.length; i++ ){
            await Model.updateOne({ _id: data[i]['_id'] }, { $set: data[i]});
        }
        return res.status(200).json({ success: true, message: 'ORDER Updated' });
    }
    // await Cms.updateMany({ }, { $set: data});
    return res.status(200).json({ success: true, message: 'ORDER Updated' });
    
}

/** @Function update model status active or inactive */
module.exports.updateStatus = async (req, res) => {
    let id= req.body._id;
    let status= req.body.status;
    await Model.updateOne({ _id: id }, { $set: {status: status}});
    return res.status(200).json({ success: true, message: 'Status Updated' });
}



function getExtension(filename) {
    var i = filename.lastIndexOf('.');
    return (i < 0) ? '' : filename.substr(i);
}

/** @Function remove unused directory*/
function rmdirAsync (path, callback) {
	fs.readdir(path, function(err, files) {
		if(err) {
			// Pass the error on to callback
			callback(err, []);
			return;
		}
		var wait = files.length,
			count = 0,
			folderDone = function(err) {
			count++;
			// If we cleaned out all the files, continue
			if( count >= wait || err) {
				fs.rmdir(path,callback);
			}
		};
		// Empty directory to bail early
		if(!wait) {
			folderDone();
			return;
		}
		
		// Remove one or more trailing slash to keep from doubling up
		path = path.replace(/\/+$/,"");
		files.forEach(function(file) {
			var curPath = path + "/" + file;
			fs.lstat(curPath, function(err, stats) {
				if( err ) {
					callback(err, []);
					return;
				}
				if( stats.isDirectory() ) {
					rmdirAsync(curPath, folderDone);
				} else {
					fs.unlink(curPath, folderDone);
				}
			});
		});
	});
};


/** @Function remove unused directory files*/
function moveFilesAll(srcDir, destDir) {
    return fs.readdirAsync(srcDir).map(function(file) {
        var destFile = path.join(destDir, file);
        var srcFile = path.join(srcDir, file);
        return fs.renameAsync(srcFile, destFile).then(function() {
            return {file: srcFile, err: 0};
        }).catch(function(err) {
            console.log("error on " + srcFile);
            return {file: srcFile, err: err}
        });
    }).then(function(files) {
        var errors = files.filter(function(item) {
            return item.err !== 0;
        });
        if (errors.length > 0) {
            // reject with a list of error files and their corresponding errors
            throw errors;
        }
        // for success, return list of all files moved
        return files.filter(function(item) {
            return item.file;
        });
    });
}

/** @Function get active model */
module.exports.modelActive = async (req, res) => {
    // const model = await Model.find({ status: true });
    const model = await Model.aggregate([
        { $match: {status: true } },
        {
            $lookup: {
                from: "model_lists",
                localField: "_id",
                foreignField: "model",
                as: "data"
            }
            
        }, 
        {
            $unwind: {
              path: "$data",
              preserveNullAndEmptyArrays: true
            }
          },
        
        {
            $lookup: {
                from: "users",
                localField: "data.updatedBy",
                foreignField: "_id",
                as: "data.updatedBy"
            }
        },{
            $unwind: {
              path: "$data.updatedBy",
              preserveNullAndEmptyArrays: true
            }
          },
        
          {
            $lookup: {
                from: "users",
                localField: "updatedBy",
                foreignField: "_id",
                as: "updatedBy"
            }
        },{
            $unwind: {
              path: "$updatedBy",
              preserveNullAndEmptyArrays: true
            }
          },
        
         {$group : { _id: '$_id', "model": { "$first": "$model" },"model_folder" :{"$first": "$model_folder"}, "path"  :{"$first": "$path"}, "environmentFile"  :{"$first": "$environmentFile"}, "controlFile"  :{"$first": "$controlFile"}, "status"  :{"$first": "$status"}, "order"  :{"$first": "$order"},  "aspect"  :{"$first": "$aspect"}, "near"  :{"$first": "$near"}, "fov": { "$first": "$fov" }, "far"  :{"$first": "$far"}, "xPosition"  :{"$first": "$xPosition"}, "yPosition": { "$first": "$yPosition" }, "zPosition": { "$first": "$zPosition" }, "zControl": { "$first": "$zControl" }, "yControl": { "$first": "$yControl" }, "xControl": { "$first": "$xControl" }, "createdAt": { "$first": "$createdAt" }, "updatedAt": { "$first": "$updatedAt" }, "updatedBy": { "$first": "$updatedBy" }, data: { $push: '$data' } }},
         { $unset: ["updatedBy.password" ,"updatedBy.isAdmin", "data.updatedBy.password", "data.updatedBy.isAdmin"] }

        
        
    ]).sort({ order: 1 });
    console.log("model>>>>", model)
    
  
    if (model) {
        return res.status(200).json({ success: true, message: '', data: model });
        
    }else{
        return res.status(200).json({ success: false, message: '', data: [] });
    }
}


/** @Function delete model by id */
module.exports.mainModelDeleteById = async (req, res) => {
    try{
        let id = req.params.model_id
        
        const model = await Model.aggregate([
            {
                $match: { _id: mongoose.Types.ObjectId(id)}
            },
            {
                $lookup: {
                    from: "model_lists",
                    localField: "_id",
                    foreignField: "model",
                    as: "data"
                }
                
            }
        ]);
       
        model.forEach((value, index) => {
            
            if (fs.existsSync(process.env.UPLOAD_PATH+value.model_folder)) {
                if(value.model_folder){
          fs.rmSync(process.env.UPLOAD_PATH+value.model_folder, { recursive: true }, (err) => {

                if (err) {
                    throw err;
                }
            })
          }
        } 

            value.data.forEach(async (v, k) => {
                if (fs.existsSync(process.env.UPLOAD_HTML_PATH+v.html)) {
                    if(v.html){
                
                    fs.rmSync(process.env.UPLOAD_HTML_PATH+v.html, { recursive: true }, (err) => {
                    if (err) {
                        throw err;
                    }
                })
              }
            }
               
            const modelList=await ModelList.findOneAndDelete({model:id })
        
        })
        })

        const delmodel=await Model.findByIdAndDelete(id)
     
        return res.status(200).json({ success: true, message: '', data: model });
   
    }catch(e)                                                                                                                                                                       
    {
        console.log(e)
    }
}
    
