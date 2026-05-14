const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const config = require('./config/config');
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const FileService = require('./utils/fileService');

const app = express();

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

//force restart
app.get("/restart", (req, res) => {
  process.exit(1);
});

// EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Session & flash
app.use(session({
  secret: process.env.SESSION_SECRET || 'keyboard cat',
  resave: false,
  saveUninitialized: false
}));
app.use(flash());

// Global vars for views
app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  res.locals.user = req.session.user || null;
  next();
});

//for maintance 
app.get("/maintance", (req, res) => {
    process.exit(0);
});

// MongoDB Connection
mongoose.connect(config.MONGODB_URI, {})
  .then( async () => {
    console.log('Connected to DB:', mongoose.connection.db.databaseName);
    
    // Import routes after DB connection is established
    const routes = require('./routes');
    app.use('/', routes);
    
    // Redirect base
    app.get('/', (req, res) => res.redirect('/auth/login'));

    const PORT = config.PORT || 5000;

    try {
      await FileService.connect();
      // Start your server
      app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    } catch (error) {
      console.error('Failed to initialize file service:', error);
      process.exit(1);
    }
    // // Server Start
    // app.listen(PORT, () => {
    //   console.log(`Server running on port ${PORT}`);
    // });
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });