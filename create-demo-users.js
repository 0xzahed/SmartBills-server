/* Script to create admin user for SmartBills */
require('dotenv').config();
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

const {
  DB_USER,
  DB_PASS,
  DB_CLUSTER,
  DB_NAME = 'BillManagementDB',
} = process.env;

const encodedPassword = encodeURIComponent(DB_PASS || '');
const MONGO_URI = `mongodb+srv://${DB_USER}:${encodedPassword}@${DB_CLUSTER}/${DB_NAME}?retryWrites=true&w=majority`;

async function createAdminUser() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db(DB_NAME);
    const usersCollection = db.collection('users');
    
    // Check if admin already exists
    const existingAdmin = await usersCollection.findOne({ 
      email: 'admin@smartbills.com' 
    });
    
    if (existingAdmin) {
      console.log('Admin user already exists!');
      console.log('Email: admin@smartbills.com');
      return;
    }
    
    // Create admin user
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    const adminUser = {
      name: 'Admin User',
      email: 'admin@smartbills.com',
      password: hashedPassword,
      photoURL: 'https://i.ibb.co/qkKj3zS/admin-avatar.png',
      role: 'admin',
      phone: '+880-1712-345678',
      address: 'Dhaka, Bangladesh',
      bio: 'System Administrator',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    await usersCollection.insertOne(adminUser);
    
    console.log('✅ Admin user created successfully!');
    console.log('');
    console.log('📧 Email: admin@smartbills.com');
    console.log('🔑 Password: admin123');
    console.log('');
    console.log('⚠️  Please change the password after first login!');
    
  } catch (error) {
    console.error('Error creating admin user:', error);
  } finally {
    await client.close();
    console.log('Connection closed');
  }
}

// Create regular demo user too
async function createDemoUser() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const usersCollection = db.collection('users');
    
    const existingUser = await usersCollection.findOne({ 
      email: 'user@smartbills.com' 
    });
    
    if (existingUser) {
      console.log('Demo user already exists!');
      return;
    }
    
    const hashedPassword = await bcrypt.hash('user123', 10);
    
    const demoUser = {
      name: 'Demo User',
      email: 'user@smartbills.com',
      password: hashedPassword,
      photoURL: 'https://i.ibb.co/fMR3k7v/user-avatar.png',
      role: 'user',
      phone: '+880-1812-345678',
      address: 'Gulshan, Dhaka',
      bio: 'Regular user account',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    await usersCollection.insertOne(demoUser);
    
    console.log('✅ Demo user created successfully!');
    console.log('');
    console.log('📧 Email: user@smartbills.com');
    console.log('🔑 Password: user123');
    
  } catch (error) {
    console.error('Error creating demo user:', error);
  } finally {
    await client.close();
  }
}

async function createBothUsers() {
  console.log('🚀 Creating demo accounts...\n');
  await createAdminUser();
  console.log('');
  await createDemoUser();
  console.log('\n✨ Setup complete!');
}

createBothUsers();
