//backend/routes/weather.js
//Fetches weather for real-time data
const express = require('express');
const router = express.Router();
const axios = require('axios');
const Weather = require('../models/Weather');
require('dotenv').config();

router.get('/', async (req, res) => {
  try {
    // Accept lat/lon from the front end; default to a California point if not provided
    const latitude = req.query.lat ? parseFloat(req.query.lat) : 34.0522;
    const longitude = req.query.lon ? parseFloat(req.query.lon) : -118.2437;

    // Step 1: Get NOAA Grid info
    const gridResponse = await axios.get(`https://api.weather.gov/points/${latitude},${longitude}`, {
      headers: { 'User-Agent': 'ignis-ai (chrisjuarez1596@gmail.com)' }
    });

    if (!gridResponse.data || !gridResponse.data.properties) {
      console.error("❌ Failed to fetch NOAA grid data.");
      return res.status(500).json({ error: "NOAA grid data unavailable." });
    }

    const { gridId, gridX, gridY } = gridResponse.data.properties;

    // Step 2: Retrieve the forecast using the grid info
    const forecastURL = `https://api.weather.gov/gridpoints/${gridId}/${gridX},${gridY}/forecast`;
    console.log(`Fetching NOAA forecast from: ${forecastURL}`);

    const forecastResponse = await axios.get(forecastURL, {
      headers: { 'User-Agent': 'ignis-ai (chrisjuarez1596@gmail.com)' }
    });

    if (!forecastResponse.data || !forecastResponse.data.properties) {
      console.error("❌ No forecast data received from NOAA.");
      return res.status(500).json({ error: "No forecast data available." });
    }

    // Step 3: Format the weather data
    const weatherData = forecastResponse.data.properties.periods.map(period => ({
      latitude,
      longitude,
      temperature: period.temperature,
      humidity: period.relativeHumidity?.value || null,
      windSpeed: parseFloat(period.windSpeed.split(" ")[0]),
      windDirection: period.windDirection,
      precipitation: period.probabilityOfPrecipitation?.value || 0,
      forecast: period.shortForecast,
      timestamp: new Date(period.startTime)
    }));

    // Optional: Store these forecasts in MongoDB if you want to merge features later.
    await Weather.insertMany(weatherData);
    console.log("🌤 NOAA Weather data saved to MongoDB.");

    res.json({
      message: "NOAA Weather data stored successfully",
      count: weatherData.length,
      data: weatherData
    });

  } catch (error) {
    console.error('❌ Error fetching NOAA weather data:', error.message);
    res.status(500).json({ error: "Failed to fetch weather data", details: error.message });
  }
});

module.exports = router;