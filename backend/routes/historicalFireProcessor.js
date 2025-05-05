//ignis-ai-backend/routes/historicalFireProcessor.js
const express = require('express');
const axios = require('axios');
const csv = require('csv-parser');
const stream = require('stream');
const clustering = require('density-clustering'); // Ensure you run: npm install density-clustering
const router = express.Router();

const MAP_KEY = process.env.NASA_API_KEY; // Your NASA FIRMS MAP_KEY

// Helper: Compute Haversine distance (in meters)
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth's radius in meters
  const toRadians = (deg) => (deg * Math.PI) / 180;
  const φ1 = toRadians(lat1);
  const φ2 = toRadians(lat2);
  const Δφ = toRadians(lat2 - lat1);
  const Δλ = toRadians(lon2 - lon1);
  const a = Math.sin(Δφ / 2) ** 2 +
            Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Helper: Compute bearing between two points (in degrees)
function computeBearing(lat1, lon1, lat2, lon2) {
  const toRadians = (deg) => (deg * Math.PI) / 180;
  const toDegrees = (rad) => (rad * 180) / Math.PI;
  const φ1 = toRadians(lat1);
  const φ2 = toRadians(lat2);
  const Δλ = toRadians(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) -
            Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return (toDegrees(θ) + 360) % 360;
}

// Fetch historical FIRMS data from the API.
// Adjust the dataset identifier and bounding box as needed; here we use MODIS_SP.
async function fetchHistoricalFIRMSData() {
  // Dates can be further parameterized. Here are defaults.
  const startDate = '2020-01-01';
  const endDate = '2022-12-31';
  // The bounding box here is for the contiguous US; adjust accordingly.
  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${MAP_KEY}/MODIS_SP/-125.0,24.0,-66.0,49.0/0?startDate=${startDate}&endDate=${endDate}`;
  console.log("Fetching FIRMS CSV from:", url);
  const response = await axios.get(url, { responseType: 'text' });
  return response.data;
}

// Define the route to process historical fire data.
router.get('/process-historical-fires', async (req, res) => {
  try {
    const csvData = await fetchHistoricalFIRMSData();
    
    // Create a readable stream from the CSV data.
    const csvStream = new stream.Readable();
    csvStream.push(csvData);
    csvStream.push(null);

    // Parse CSV rows into an array of records.
    const records = [];
    await new Promise((resolve, reject) => {
      csvStream
        .pipe(csv())
        .on('data', (data) => {
          // Optionally log a row to check which columns are available:
          // console.log("CSV row:", data);
          // Map FIRMS attributes (adjust field names based on the actual CSV).
          // Here, we assume the CSV contains at least:
          // latitude, longitude, bright_ti4, acq_date, acq_time, satellite, instrument, etc.
          const timestamp = data.acq_date ? new Date(data.acq_date) : null;
          records.push({
            latitude: parseFloat(data.latitude),
            longitude: parseFloat(data.longitude),
            // Use bright_ti4 as a proxy for fire intensity (brightness)
            brightness: data.bright_ti4 ? parseFloat(data.bright_ti4) : null,
            // You may capture acquisition date and time:
            acq_date: data.acq_date ? data.acq_date.trim() : null,
            acq_time: data.acq_time ? data.acq_time.trim() : null,
            timestamp,
            // Additional fields (if needed)
            satellite: data.satellite ? data.satellite.trim() : null,
            instrument: data.instrument ? data.instrument.trim() : null,
            confidence: data.confidence ? parseFloat(data.confidence) : null
          });
        })
        .on('end', resolve)
        .on('error', reject);
    });

    console.log(`Fetched ${records.length} FIRMS records.`);

    // Use DBSCAN to cluster records spatially (by latitude and longitude).
    const dbscan = new clustering.DBSCAN();
    const dataset = records.map(rec => [rec.latitude, rec.longitude]);
    // epsilon: clustering radius (in degrees); minPts: minimum points to form a cluster.
    const epsilon = req.query.epsilon ? parseFloat(req.query.epsilon) : 0.1;
    const minPts = req.query.minPts ? parseInt(req.query.minPts, 10) : 3;
    const clusters = dbscan.run(dataset, epsilon, minPts);
    console.log(`Found ${clusters.length} clusters (potential fire events).`);

    // Process each cluster to calculate event-based spread metrics.
    const events = [];
    clusters.forEach(cluster => {
      const clusterRecords = cluster.map(idx => records[idx]);
      // Sort detections in each cluster by timestamp.
      clusterRecords.sort((a, b) => a.timestamp - b.timestamp);
      const startRecord = clusterRecords[0];
      const endRecord = clusterRecords[clusterRecords.length - 1];
      const distance = haversineDistance(startRecord.latitude, startRecord.longitude, endRecord.latitude, endRecord.longitude);
      const timeDiffHours = (endRecord.timestamp - startRecord.timestamp) / (1000 * 3600);
      const spreadSpeed = timeDiffHours > 0 ? distance / timeDiffHours : 0; // in meters per hour
      const bearing = computeBearing(startRecord.latitude, startRecord.longitude, endRecord.latitude, endRecord.longitude);
      const avgBrightness = clusterRecords.reduce((sum, r) => sum + (r.brightness || 0), 0) / clusterRecords.length;

      events.push({
        clusterSize: clusterRecords.length,
        startTime: startRecord.timestamp,
        endTime: endRecord.timestamp,
        startLat: startRecord.latitude,
        startLon: startRecord.longitude,
        endLat: endRecord.latitude,
        endLon: endRecord.longitude,
        displacementMeters: distance,
        spreadSpeedMPerHour: spreadSpeed,
        bearing: bearing,  // Fire spread direction in degrees
        averageBrightness: avgBrightness,
        detections: clusterRecords  // Optionally include the raw records within this cluster
      });
    });

    console.log("Computed fire events (with spread metrics):", events);
    res.json({
      message: "Historical fire events processed successfully.",
      events: events
    });
  } catch (err) {
    console.error("Error processing historical fire data:", err.message);
    res.status(500).json({ error: "Processing error", details: err.message });
  }
});

module.exports = router;