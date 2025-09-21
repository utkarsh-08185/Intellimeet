const express = require('express');
const path = require('path');
const app = express();

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'test-download.html'));
});

const port = 3000;
app.listen(port, () => {
  console.log(`Static file server running at http://localhost:${port}`);
});
