# SmartBills API - Complete Endpoint Reference

**Base URL:** `https://utility-bil-management-server-lovat.vercel.app`  
**Local:** `http://localhost:3000`

## 📋 Table of Contents
1. [Authentication](#authentication)
2. [Upload](#upload)
3. [User Profile](#user-profile)
4. [Providers](#providers)
5. [Bills (Templates)](#bills-templates)
6. [My Bills (User Bills)](#my-bills-user-bills)
7. [Subscriptions](#subscriptions)
8. [Payments](#payments)
9. [Dashboard Analytics](#dashboard-analytics)
10. [Reviews & Ratings](#reviews--ratings)
11. [AI Features](#ai-features)

---

## 🔐 Authentication

### Register
```http
POST /auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "confirmPassword": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "user"
  }
}
```

### Login
```http
POST /auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "password123"
}
```

**Response:** Same as register

---

## 📸 Upload

### Upload Image (Cloudinary)
```http
POST /upload/image
Authorization: Bearer {token}
Content-Type: application/json

{
  "image": "data:image/png;base64,iVBORw0KGgoAAAANS...",
  "folder": "smartbills"
}
```

**Response:**
```json
{
  "success": true,
  "url": "https://res.cloudinary.com/drtldxn1k/image/upload/v1234/smartbills/abc.jpg",
  "publicId": "smartbills/abc"
}
```

---

## 👤 User Profile

### Get Profile
```http
GET /users/profile
Authorization: Bearer {token}
```

### Update Profile (POST)
```http
POST /users/profile
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "John Updated",
  "photoURL": "https://cloudinary.com/image.jpg",
  "phone": "+880-1712-345678",
  "address": "Dhaka, Bangladesh",
  "bio": "Software Developer"
}
```

### Update Profile (PUT)
```http
PUT /users/profile
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "John Updated",
  "photoURL": "https://cloudinary.com/image.jpg",
  "phone": "+880-1712-345678",
  "address": "Dhaka, Bangladesh",
  "bio": "Software Developer"
}
```

---

## 🏢 Providers

### Get All Providers
```http
GET /providers?type=Electricity&search=dhaka&sort=name&order=asc&page=1&limit=12
```

**Query Parameters:**
- `type` - Filter by type (Electricity, Gas, Water, Internet)
- `search` - Search in name, description, zone
- `sort` - Sort field (name, type, createdAt)
- `order` - Sort order (asc, desc)
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 12, max: 100)

### Get Single Provider
```http
GET /providers/:id
```

### Create Provider (Admin)
```http
POST /providers
Authorization: Bearer {admin-token}
Content-Type: application/json

{
  "name": "Dhaka Electric Supply Co.",
  "type": "Electricity",
  "description": "Reliable electricity service",
  "pricing": "৳8.25 per KWh",
  "coverage": "Dhaka North & East",
  "website": "https://www.desco.org.bd",
  "logo": "https://cloudinary.com/logo.png",
  "billingType": "Monthly",
  "paymentMethod": "Card, Mobile Wallet",
  "zone": "Gulshan, Banani, Uttara",
  "lateFeePolicy": "2% after due date",
  "hotline": "+880-9666-222-555",
  "supportEmail": "support@desco.org.bd",
  "address": "House 22/B, Road 12, Dhaka"
}
```

### Update Provider (Admin)
```http
PUT /providers/:id
Authorization: Bearer {admin-token}
Content-Type: application/json

{
  "name": "Updated Provider Name",
  "pricing": "Updated pricing info"
}
```

### Delete Provider (Admin)
```http
DELETE /providers/:id
Authorization: Bearer {admin-token}
```

---

## 📄 Bills (Templates)

### Get All Bills
```http
GET /bills?category=Electricity&search=desco&minAmount=1000&maxAmount=5000&location=dhaka&sort=amount&order=desc&page=1&limit=12
```

**Query Parameters:**
- `category` - Filter by category
- `search` - Search in title, description
- `minAmount` - Minimum amount filter
- `maxAmount` - Maximum amount filter
- `location` - Filter by location
- `sort` - Sort field (date, amount, title)
- `order` - Sort order (asc, desc)
- `page` - Page number
- `limit` - Items per page

### Get Single Bill
```http
GET /bills/:id
```

### Get Recent Bills
```http
GET /bills/recent?limit=6
GET /recent-bills
```

### Create Bill (Admin)
```http
POST /bills
Authorization: Bearer {admin-token}
Content-Type: application/json

{
  "title": "DESCO Residential Bill",
  "category": "Electricity",
  "amount": 1450,
  "location": "Banani, Dhaka",
  "date": "2026-01-15",
  "dueDate": "2026-01-25",
  "description": "Monthly electricity usage",
  "image": "https://cloudinary.com/bill.jpg",
  "providerId": "507f1f77bcf86cd799439011"
}
```

### Update Bill (Admin)
```http
PUT /bills/:id
Authorization: Bearer {admin-token}
Content-Type: application/json

{
  "amount": 1500,
  "dueDate": "2026-01-30"
}
```

### Delete Bill (Admin)
```http
DELETE /bills/:id
Authorization: Bearer {admin-token}
```

---

## 💳 My Bills (User Bills)

### Get My Bills
```http
GET /mybills?email=user@example.com&category=Electricity&search=electric&minAmount=500&maxAmount=2000&sort=date&order=desc&page=1&limit=10
```

**Query Parameters:**
- `email` - **Required** - User email
- `category` - Filter by category
- `search` - Search in title, username
- `minAmount` - Minimum amount filter
- `maxAmount` - Maximum amount filter
- `sort` - Sort field (date, amount, title)
- `order` - Sort order (asc, desc)
- `page` - Page number
- `limit` - Items per page

### Create My Bill
```http
POST /mybills
Content-Type: application/json

{
  "email": "user@example.com",
  "title": "My Electric Bill",
  "username": "John Doe",
  "category": "Electricity",
  "amount": 1500,
  "date": "2026-01-15",
  "dueDate": "2026-01-25"
}
```

### Update My Bill
```http
PUT /mybills/:id
Content-Type: application/json

{
  "email": "user@example.com",
  "amount": 1600,
  "dueDate": "2026-01-30"
}
```

### Delete My Bill
```http
DELETE /mybills/:id?email=user@example.com
```

---

## 🔔 Subscriptions

### Get Subscriptions
```http
GET /subscriptions?email=user@example.com
```

### Create Subscription
```http
POST /subscriptions
Content-Type: application/json

{
  "email": "user@example.com",
  "providerId": "507f1f77bcf86cd799439011"
}
```

---

## 💰 Payments

### Get Payments
```http
GET /payments?email=user@example.com&status=completed&limit=50
```

### Complete Payment (Record & Send Invoice)
```http
POST /payments/complete
Content-Type: application/json

{
  "email": "user@example.com",
  "username": "John Doe",
  "billTitle": "Electric Bill - January 2026",
  "billCategory": "Electricity",
  "providerName": "DESCO",
  "amount": 1500,
  "paymentMethod": "Credit Card",
  "paymentDate": "2026-01-18",
  "transactionId": "TXN123456789",
  "cardLast4": "1234",
  "address": "House 12, Road 5, Banani, Dhaka"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Payment recorded and invoice emailed.",
  "emailStatus": {
    "sent": true
  }
}
```

---

## 📊 Dashboard Analytics

### User Dashboard Stats
```http
GET /dashboard/stats?email=user@example.com
```

**Response:**
```json
{
  "overview": {
    "totalBills": 45,
    "totalPayments": 40,
    "totalSubscriptions": 4,
    "totalSpent": 58500
  },
  "categoryStats": [
    {
      "_id": "Electricity",
      "total": 25000,
      "count": 12
    },
    {
      "_id": "Gas",
      "total": 15000,
      "count": 10
    }
  ],
  "monthlyStats": [
    {
      "_id": "2026-01",
      "total": 5500,
      "count": 4
    }
  ],
  "recentBills": [...]
}
```

### Admin Dashboard Stats
```http
GET /dashboard/admin/stats
Authorization: Bearer {admin-token}
```

**Response:**
```json
{
  "overview": {
    "totalUsers": 150,
    "totalBills": 500,
    "totalPayments": 450,
    "totalProviders": 20,
    "totalRevenue": 1500000
  },
  "categoryDistribution": [...],
  "monthlyRevenue": [...],
  "recentUsers": [...]
}
```

---

## ⭐ Reviews & Ratings

### Get Reviews for Provider
```http
GET /reviews?providerId=507f1f77bcf86cd799439011
```

**Response:**
```json
{
  "reviews": [
    {
      "_id": "...",
      "providerId": "...",
      "userId": "...",
      "userName": "John Doe",
      "userPhoto": "https://...",
      "rating": 5,
      "comment": "Excellent service!",
      "createdAt": "2026-01-18T10:00:00.000Z"
    }
  ],
  "summary": {
    "totalReviews": 25,
    "averageRating": "4.3"
  }
}
```

### Create Review
```http
POST /reviews
Authorization: Bearer {token}
Content-Type: application/json

{
  "providerId": "507f1f77bcf86cd799439011",
  "rating": 5,
  "comment": "Excellent service and support!"
}
```

### Delete Review
```http
DELETE /reviews/:id
Authorization: Bearer {token}
```
*Note: Users can delete own reviews, admins can delete any*

---

## 🤖 AI Features

### Chat with AI Assistant
```http
POST /ai/chat
Content-Type: application/json

{
  "message": "What are my upcoming bills?",
  "email": "user@example.com",
  "history": [
    {
      "role": "user",
      "content": "Previous message"
    },
    {
      "role": "assistant",
      "content": "Previous response"
    }
  ]
}
```

**Response:**
```json
{
  "response": "Based on your data, you have 3 upcoming bills...",
  "suggestions": [
    "Show my upcoming bills",
    "Summarize my spending this month",
    "Remind me before due dates"
  ]
}
```

### Get AI Insights
```http
POST /ai/insights
Content-Type: application/json

{
  "email": "user@example.com",
  "timeframe": "90"
}
```

**Response:**
```json
{
  "timeframe": "90",
  "summary": {
    "billCount": 12,
    "totalSpent": 15500,
    "byCategory": {
      "Electricity": 8000,
      "Gas": 4500,
      "Water": 3000
    },
    "recentPayments": [...]
  },
  "ai": "• Your electricity bills averaged ৳666.67/month\n• Gas spending decreased by 15%\n• Consider budget alerts"
}
```

---

## 🔒 Authentication

### Header Format
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Roles
- **user** - Regular user (default)
- **admin** - Administrator with full access

---

## 📝 Response Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `401` - Unauthorized (no token)
- `403` - Forbidden (invalid token or insufficient permissions)
- `404` - Not Found
- `500` - Internal Server Error

---

## 🌐 CORS Configuration

**Allowed Origins:**
- `http://localhost:5173` (local dev)
- `http://localhost:5174` (local dev alternate)
- `https://utility-bil-management.vercel.app` (production)

---

## 📦 Environment Variables Required

```env
PORT=3000
DB_USER=your_mongodb_username
DB_PASS=your_mongodb_password
DB_CLUSTER=your_cluster.mongodb.net
DB_NAME=BillManagementDB
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=llama-3.3-70b-versatile
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM=SmartBills <your_email@gmail.com>
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=336239465482777
CLOUDINARY_API_SECRET=sBmpVNgQpyH-Fn_F7GqJOMJVzVo
```

---

## ✅ All APIs are Production Ready!

**Features:**
- ✅ Full JWT Authentication
- ✅ Role-based Authorization
- ✅ Complete CRUD Operations
- ✅ Search, Filter, Sort, Pagination
- ✅ Dashboard Analytics
- ✅ Image Upload (Cloudinary)
- ✅ Email Notifications
- ✅ AI Chat & Insights
- ✅ Reviews & Ratings System
- ✅ Error Handling
- ✅ Input Validation
- ✅ CORS Configuration
- ✅ MongoDB Integration

**Deployment Ready:**
- Vercel configuration included
- Environment variables properly configured
- CORS setup for production
- Error logging enabled
- Graceful shutdown handling
