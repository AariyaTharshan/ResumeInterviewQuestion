const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI).then(() => {
  console.log('MongoDB connected');
}).catch(err => {
  console.error('MongoDB connection error:', err);
});

const ScoreSchema = new mongoose.Schema({
  name: String,
  email: String,
  picture: String,
  googleId: String,
  score: Number,
  date: { type: Date, default: Date.now }
});

const Score = mongoose.model('Score', ScoreSchema);

app.post('/api/score', async (req, res) => {
  const { name, email, picture, googleId, score } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  const existing = await Score.findOne({ email });
  if (!existing) {
    await new Score({ name, email, picture, googleId, score }).save();
    return res.json({ success: true, new: true });
  }
  if (score > existing.score) {
    existing.score = score;
    existing.name = name;
    existing.picture = picture;
    existing.googleId = googleId;
    existing.date = new Date();
    await existing.save();
    return res.json({ success: true, updated: true });
  }
  return res.json({ success: true, updated: false });
});

app.get('/api/leaderboard', async (req, res) => {
  const topScores = await Score.find().sort({ score: -1, date: 1 }).limit(10);
  res.json(topScores);
});

app.listen(3000, () => console.log('Server running on port 4000'));
