const express = require('express');
const app = express();
require('express-async-errors');
require('dotenv').config()
require('child_process');
const error = require('./middleware/promisesErrorHandler');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const http = require('http').createServer(app);
const fileUpload = require('express-fileupload');

app.use(fileUpload({
  createParentPath: true
}));
app.use(express.static("uploads"));

app.use(express.json({limit: "500mb"}));
app.use(express.urlencoded({limit: '500mb'}));


app.use(cors());
app.use(morgan('tiny'));
app.use(function (req, res, next) {

  // Website you wish to allow to connect
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Request methods you wish to allow
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');

  // Request headers you wish to allow
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');

  // Set to true if you need the website to include cookies in the requests sent
  // to the API (e.g. in case you use sessions)
  res.setHeader('Access-Control-Allow-Credentials', true);

  // Pass to next layer of middleware
  next();
});
//api modules
require('./app/imanual_model/routes_definations/imodelRoutesDef')(app);
require('./app/users/routes_definations/usersRoutesDef')(app);
require('./app/cms/routes_definations/cmsRoutesDef')(app);
app.use(error);

mongoose
  .connect(process.env.MONGO_CONNETION,{ useNewUrlParser: true, useUnifiedTopology: true, useFindAndModify: false, useCreateIndex: true })
  .then(() => {
    console.log('connected to the db......');
  })
  .catch(err => {
    console.log('Error .....', err.message);
  });
const pid = process.pid;


const port = process.env.PORT || 8000;
const server = http.listen(port, () => {
  console.log(`listening port ${port} and process of ${pid}`);
});





