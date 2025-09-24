const express = require('express');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();

const LOG_DIR = '.';

// Serve static frontend files (assuming frontend in 'public')
app.use(express.static(path.join(__dirname, 'public')));

// Middleware for parsing JSON (if needed)
app.use(express.json());

// Use CORS middleware to allow requests from any origin
app.use(cors({
  origin: true,
  credentials: true
}));

// Fallback to index.html for SPA routes
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Endpoint to create an empty log file for a meeting when hosted
app.post('/create-log-file', async (req, res) => {
  const { meetingId } = req.body;
  if (!meetingId) {
    return res.status(400).send('Missing meetingId');
  }
  const logFileName = `meeting-logs-${meetingId}.txt`;
  try {
    // Create empty file if it doesn't exist
    await fs.open(logFileName, 'wx');
    console.log(`Created empty log file for meeting ${meetingId}`);
    res.status(201).send('Log file created');
  } catch (err) {
    if (err.code === 'EEXIST') {
      // File already exists
      res.status(200).send('Log file already exists');
    } else {
      console.error('Error creating log file:', err);
      res.status(500).send('Failed to create log file');
    }
  }
});

// Main log storage route
// This route is a POST endpoint to receive log data from the frontend
app.post('/log', async (req, res) => {
  const { action, uid, timestamp, meetingId, attendeeName, hostName, userAgent, platform, language, loggerSource } = req.body;
  const logEntry = `${action},${uid},${attendeeName || ''},${hostName || ''},${timestamp},${userAgent || ''},${platform || ''},${language || ''},${loggerSource || ''}\n`; // CSV format with additional details
  const logFileName = meetingId ? `meeting-logs-${meetingId}.txt` : 'meeting-logs.txt';

  try {
    await fs.appendFile(logFileName, logEntry);
    console.log(`[${loggerSource || 'Unknown'}] ${action} - UID: ${uid}, Attendee: ${attendeeName || 'Unknown'}, Host: ${hostName || 'Unknown'}, Platform: ${platform || 'Unknown'}, Language: ${language || 'Unknown'} at ${timestamp} for meeting ${meetingId}`);
    res.status(200).send('Log written');
  } catch (err) {
    console.error('Error writing to log file:', err);
    res.status(500).send('Failed to write log');
  }
});

// Route to get logs (for viewing in browser)
app.get('/logs', async (req, res) => {
  const { meetingId } = req.query;
  const logFileName = meetingId ? `meeting-logs-${meetingId}.txt` : 'meeting-logs.txt';

  try {
    const data = await fs.readFile(logFileName, 'utf8');
    // Split the data by new line, and filter out any empty lines
    const logs = data.split('\n').filter(Boolean);
    res.json(logs);
  } catch (err) {
    console.error('Error reading log file:', err);
    // If file doesn't exist, return an empty array
    return res.status(200).json([]);
  }
});

// NEW: Route to download logs as an Excel (CSV) file
app.get('/download-logs-excel', async (req, res) => {
    const meetingId = req.query.meetingId;
    if (!meetingId) return res.status(400).send('Missing meetingId');

    const filePath = path.join(LOG_DIR, `meeting-logs-${meetingId}.txt`);

    console.log('[Download Attempt] MeetingId:', meetingId);
    console.log('[Download Attempt] Full Path:', filePath);

    try {
        // Check if file exists using promises API
        await fs.access(filePath);

        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Content-Disposition', `attachment; filename="meeting-logs-${meetingId}.txt"`);

        const fileStream = fsSync.createReadStream(filePath);
        fileStream.on('error', (err) => {
            console.error('[Stream Error]:', err);
            res.status(500).end('Server error while reading file');
        });

        fileStream.pipe(res);
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.log('[Error] File does not exist:', filePath);
            return res.status(404).send('Log file not found');
        }
        console.error('[Download Error]:', err);
        res.status(500).end('Server error while accessing file');
    }
});

// Route to list .txt files in the directory
app.get('/logs/list', async (req, res) => {
  try {
    const files = await fs.readdir('.');
    const txtFiles = files.filter(file => file.endsWith('.txt'));
    res.json(txtFiles);
  } catch (err) {
    console.error('Error listing files:', err);
    res.status(500).send('Failed to list files');
  }
});

// Route to list available meeting IDs from log files
app.get('/meeting-ids', async (req, res) => {
  try {
    const files = await fs.readdir('.');
    const meetingIds = files
      .filter(file => file.startsWith('meeting-logs-') && file.endsWith('.txt'))
      .map(file => file.replace('meeting-logs-', '').replace('.txt', ''));
    res.json(meetingIds);
  } catch (err) {
    console.error('Error listing meeting IDs:', err);
    res.status(500).send('Failed to list meeting IDs');
  }
});

// Route to read a file
app.get('/logs/content', async (req, res) => {
  const { file } = req.query;
  if (!file) {
    return res.status(400).send('File required');
  }
  try {
    const content = await fs.readFile(file, 'utf8');
    res.send(content);
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.status(404).send('File not found');
    } else {
      console.error('Error reading file:', err);
      res.status(500).send('Failed to read file');
    }
  }
});

// Route to save a file
app.post('/logs/save', async (req, res) => {
  const { file, content } = req.body;
  if (!file || content === undefined) {
    return res.status(400).send('File and content required');
  }
  try {
    await fs.writeFile(file, content);
    res.send('File saved');
  } catch (err) {
    console.error('Error saving file:', err);
    res.status(500).send('Failed to save file');
  }
});

// Route to download a file
app.get('/logs/download', async (req, res) => {
  const { file } = req.query;
  if (!file) {
    return res.status(400).send('File required');
  }
  try {
    const content = await fs.readFile(file);
    res.header('Content-Type', 'text/plain');
    res.attachment(file);
    res.send(content);
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.status(404).send('File not found');
    } else {
      console.error('Error downloading file:', err);
      res.status(500).send('Failed to download file');
    }
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});

// Handle unhandled promise rejections to prevent server crash
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Optionally, you can exit the process or handle it differently
  // process.exit(1);
});