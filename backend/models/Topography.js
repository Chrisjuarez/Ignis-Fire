// models/Topography.js
const mongoose = require('mongoose');

const TopographySchema = new mongoose.Schema({
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true } // [lon, lat]
  },
  elevation:      Number,
  slope:          Number,
  vegetationType: String
});
TopographySchema.index({ location: '2dsphere' });
module.exports = mongoose.model('Topography', TopographySchema);