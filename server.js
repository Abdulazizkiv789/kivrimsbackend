require('dotenv').config(); // Load environment variables

const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const moment = require('moment');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("❌ Error: MONGODB_URI not defined in .env");
  process.exit(1);
}
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

// M-Pesa Environment Variables
const {
  MPESA_CONSUMER_KEY,
  MPESA_CONSUMER_SECRET,
  MPESA_PASSKEY,
  MPESA_SHORTCODE,
  MPESA_CALLBACK_URL,
} = process.env;

// Get M-Pesa Access Token
const getAccessToken = async () => {
  try {
    const auth = Buffer.from(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`).toString('base64');
    const response = await axios.get(
      'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
      {
        headers: {
          Authorization: `Basic ${auth}`,
        },
      }
    );
    return response.data.access_token;
  } catch (error) {
    console.error('❌ M-Pesa token error:', error.response?.data || error.message);
    throw new Error('Failed to get M-Pesa access token');
  }
};

// M-Pesa STK Push Endpoint
app.post('/api/stk-push', async (req, res) => {
  const { amount, phone } = req.body;

  if (!amount || !phone) {
    return res.status(400).json({ message: 'Amount and phone number are required.' });
  }

  const formatPhoneNumber = (phone) => {
  let formatted = phone.trim();

  // Remove "+" if user enters +254...
  if (formatted.startsWith('+')) {
    formatted = formatted.slice(1);
  }

  // Convert '07...' and '01...' to '2547...' and '2541...'
  if (formatted.startsWith('07') || formatted.startsWith('01')) {
    formatted = '254' + formatted.slice(1);
  }

  return formatted;
};

const formattedPhone = formatPhoneNumber(phone);

  try {
    const accessToken = await getAccessToken();
    const timestamp = moment().format('YYYYMMDDHHmmss');
    const password = Buffer.from(`${MPESA_SHORTCODE}${MPESA_PASSKEY}${timestamp}`).toString('base64');

    const stkPushPayload = {
      BusinessShortCode: MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: amount,
      PartyA: formattedPhone,
      PartyB: MPESA_SHORTCODE,
      PhoneNumber: formattedPhone,
      CallBackURL: MPESA_CALLBACK_URL,
      AccountReference: 'User Payment',
      TransactionDesc: 'Payment for services'
    };

    const response = await axios.post(
      'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      stkPushPayload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data.ResponseCode === '0') {
      res.status(200).json({ message: '✅ STK Push initiated successfully!', data: response.data });
    } else {
      console.error('❌ STK Push failed:', response.data);
      res.status(500).json({ message: 'STK Push initiation failed.', error: response.data });
    }
  } catch (error) {
    console.error('❌ STK Push error:', error.response?.data || error.message);
    res.status(500).json({ message: 'Server error during M-Pesa STK Push.', error: error.message });
  }
});

// M-Pesa Callback Handler
app.post('/api/mpesa-callback', (req, res) => {
  console.log('📲 M-Pesa Callback received:', req.body);

  // You can save callback data here if needed

  res.status(200).json({ message: '✅ Callback received' });
});

// Contact Message Schema and Model
const contactMessageSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  subject: { type: String, required: true },
  message: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const ContactMessage = mongoose.model('ContactMessage', contactMessageSchema);

// Routes
app.get('/', (req, res) => {
    res.send("✅ KivRims Backend API is running!");
});

app.post('/api/contact', async (req, res) => {
  const { name, email, subject, message } = req.body;

  if (!name || !email || !subject || !message) {
    return res.status(400).json({ message: 'All fields are required.' });
  }

  try {
    const newMessage = new ContactMessage({ name, email, subject, message });
    await newMessage.save();
    res.status(201).json({ message: '✅ Contact message sent successfully!', data: newMessage });
  } catch (error) {
    console.error('❌ Contact message error:', error);
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
});

app.post('/api/mpesa-callback', (req, res) => {
  console.log('📲 M-Pesa Callback received:', req.body);
  res.status(200).json({ message: 'Callback received' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});