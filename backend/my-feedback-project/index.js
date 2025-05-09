const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const db = require('./db');

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.post('/submit-feedback', (req, res) => {
  const { name, message } = req.body;

  const sql = 'INSERT INTO feedback (name, message) VALUES (?, ?)';
  db.query(sql, [name, message], (err, result) => {
    if (err) {
      console.error('Error saving feedback:', err);
      return res.status(500).json({ success: false, msg: 'Database error' });
    }
    res.status(200).json({ success: true, msg: 'Feedback saved!' });
  });
});


app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});

app.get('/get-feedbacks', (req, res) => {
    const sql = 'SELECT * FROM feedback ORDER BY id DESC';
    db.query(sql, (err, results) => {
      if (err) {
        console.error('Error fetching feedback:', err);
        return res.status(500).json({ success: false, msg: 'Database error' });
      }
      res.status(200).json(results);
    });
  });
  