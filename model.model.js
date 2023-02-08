const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  model:{
    type: String,
    default: ""
  },
  model_folder:{
    type: String,
    default: ""
  },
  path:{
    type: String,
    default: ""
  },
  environmentFile:{
    type: String,
    default: ""
  },
  controlFile:{
    type: String,
    default: ""
  },
  status:{
    type: Boolean,
    default: true
  },
  order: {
    type: Number,
    default: 0
  },
  fov: {
    type: Number,
    default: 34.5158770189817
  },
  aspect:{
    type: Number,
    default: 1
  },
  near:{
    type: Number,
    default: 1
  },
  far:{
    type: Number,
    default: 1000
  },
  zPosition:{
    type: Number,
    default: 3
  },
  yPosition:{
    type: Number,
    default: 2
  },
  xPosition:{
    type: Number,
    default: 2
  },
  zControl:{
    type: Number,
    default: -.02
  },
  yControl:{
    type: Number,
    default: 0
  },
  xControl:{
    type: Number,
    default: 0
  },
  zControlAnimation:{
    type: Number,
    default: -.02
  },
  yControlAnimation:{
    type: Number,
    default: 0
  },
  xControlAnimation:{
    type: Number,
    default: 0
  },
  environmentHdr:{
    type: Boolean,
    default: true
  },
  updatedBy:{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: { updatedAt: true }} );

schema.index({ model: 1 });
const Model = mongoose.model('model', schema);
module.exports.Model = Model;
