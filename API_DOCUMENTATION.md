# SmartBills API Documentation

Base URL: `http://localhost:3001`

## Authentication

All protected routes require a JWT token in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

## Demo Credentials

### User Account

- **Email:** user@smartbills.com
- **Password:** user123

### Admin Account

- **Email:** admin@smartbills.com
- **Password:** admin123

---

## Authentication Endpoints

### Register User

**POST** `/auth/register`

**Body:**

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "photoURL": "https://example.com/photo.jpg" (optional)
}
```

**Response:**

```json
{
  "success": true,
  "token": "jwt_token_here",
  "user": {
    "_id": "user_id",
    "name": "John Doe",
    "email": "john@example.com",
    "photoURL": "https://example.com/photo.jpg",
    "role": "user"
  }
}
```

### Login

**POST** `/auth/login`

**Body:**

```json
{
  "email": "john@example.com",
  "password": "password123"
}
```

**Response:** Same as register

---

## User Profile Endpoints

### Get Profile

**GET** `/users/profile`

- **Auth Required:** Yes

### Update Profile

**PUT** `/users/profile`

- **Auth Required:** Yes

**Body:**

```json
{
  "name": "John Doe Updated",
  "photoURL": "https://example.com/new-photo.jpg",
  "phone": "+8801712345678",
  "address": "Dhaka, Bangladesh",
  "bio": "Software Developer"
}
```

---

## Provider Endpoints (Utility Companies)

### Get All Providers

**GET** `/providers`

**Query Parameters:**

- `type` - Filter by type (Electricity, Gas, Water, Internet)
- `search` - Search in name, description, zone
- `sort` - Sort field (name, type, createdAt)
- `order` - Sort order (asc, desc)
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 12, max: 100)

**Example:** `/providers?type=Electricity&search=dhaka&page=1&limit=10`

**Response:**

```json
{
  "providers": [...],
  "pagination": {
    "total": 50,
    "page": 1,
    "limit": 10,
    "totalPages": 5
  }
}
```

### Get Single Provider

**GET** `/providers/:id`

### Create Provider (Admin Only)

**POST** `/providers`

- **Auth Required:** Yes (Admin)

**Body:**

```json
{
  "name": "Dhaka Electric Supply Co.",
  "type": "Electricity",
  "description": "Reliable electricity service",
  "pricing": "৳8.25 per KWh",
  "coverage": "Dhaka North & East",
  "website": "https://www.desco.org.bd",
  "logo": "https://example.com/logo.png",
  "billingType": "Monthly",
  "paymentMethod": "Card, Mobile Wallet, Bank",
  "zone": "Gulshan, Banani, Uttara",
  "lateFeePolicy": "2% after due date",
  "hotline": "+880-9666-222-555",
  "supportEmail": "support@desco.org.bd",
  "address": "House 22/B, Road 12, Dhaka"
}
```

### Update Provider (Admin Only)

**PUT** `/providers/:id`

- **Auth Required:** Yes (Admin)

**Body:** Same fields as Create (all optional)

### Delete Provider (Admin Only)

**DELETE** `/providers/:id`

- **Auth Required:** Yes (Admin)

---

## Bills Endpoints (Public Bill Templates)

### Get All Bills

**GET** `/bills`

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

**Example:** `/bills?category=Electricity&minAmount=1000&maxAmount=5000&page=1`

### Get Single Bill

**GET** `/bills/:id`

### Create Bill (Admin Only)

**POST** `/bills`

- **Auth Required:** Yes (Admin)

**Body:**

```json
{
  "title": "DESCO Residential Bill",
  "category": "Electricity",
  "amount": 1450,
  "location": "Banani, Dhaka",
  "date": "2026-01-15",
  "dueDate": "2026-01-25",
  "description": "Monthly electricity usage",
  "image": "https://example.com/bill.jpg",
  "providerId": "provider_object_id" (optional)
}
```

### Update Bill (Admin Only)

**PUT** `/bills/:id`

- **Auth Required:** Yes (Admin)

### Delete Bill (Admin Only)

**DELETE** `/bills/:id`

- **Auth Required:** Yes (Admin)

---

## My Bills Endpoints (User's Personal Bills)

### Get My Bills

**GET** `/mybills`

- **Auth Required:** Yes

**Query Parameters:** Same as `/bills` endpoint

### Create My Bill

**POST** `/mybills`

- **Auth Required:** Yes

**Body:**

```json
{
  "title": "My Electric Bill",
  "username": "John Doe",
  "category": "Electricity",
  "amount": 1500,
  "date": "2026-01-15",
  "dueDate": "2026-01-25"
}
```

### Update My Bill

**PUT** `/mybills/:id`

- **Auth Required:** Yes

### Delete My Bill

**DELETE** `/mybills/:id`

- **Auth Required:** Yes

---

## Subscriptions Endpoints

### Get Subscriptions

**GET** `/subscriptions?email=user@example.com`

### Create Subscription

**POST** `/subscriptions`

**Body:**

```json
{
  "email": "user@example.com",
  "providerId": "provider_object_id"
}
```

---

## Payments Endpoints

### Get Payments

**GET** `/payments?email=user@example.com&status=completed&limit=50`

### Complete Payment (Record Payment)

**POST** `/payments/complete`

**Body:**

```json
{
  "email": "user@example.com",
  "username": "John Doe",
  "billTitle": "Electric Bill",
  "billCategory": "Electricity",
  "providerName": "DESCO",
  "amount": 1500,
  "paymentMethod": "Credit Card",
  "paymentDate": "2026-01-18",
  "transactionId": "TXN123456",
  "cardLast4": "1234",
  "address": "Dhaka, Bangladesh"
}
```

---

## Dashboard Analytics Endpoints

### Get User Dashboard Stats

**GET** `/dashboard/stats`

- **Auth Required:** Yes

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

### Get Admin Dashboard Stats

**GET** `/dashboard/admin/stats`

- **Auth Required:** Yes (Admin)

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

## Reviews & Ratings Endpoints

### Get Reviews for Provider

**GET** `/reviews?providerId=provider_id`

**Response:**

```json
{
  "reviews": [...],
  "summary": {
    "totalReviews": 25,
    "averageRating": "4.3"
  }
}
```

### Create Review

**POST** `/reviews`

- **Auth Required:** Yes

**Body:**

```json
{
  "providerId": "provider_object_id",
  "rating": 5,
  "comment": "Excellent service!"
}
```

### Delete Review

**DELETE** `/reviews/:id`

- **Auth Required:** Yes (Own review or Admin)

---

## AI Assistant Endpoints

### Chat with AI

**POST** `/ai/chat`

**Body:**

```json
{
  "message": "What are my upcoming bills?",
  "email": "user@example.com",
  "history": [
    { "role": "user", "content": "Previous message" },
    { "role": "assistant", "content": "Previous response" }
  ]
}
```

### Get AI Insights

**POST** `/ai/insights`

**Body:**

```json
{
  "email": "user@example.com",
  "timeframe": "90"
}
```

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "error": "Error message description"
}
```

**Common Status Codes:**

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized (No token)
- `403` - Forbidden (Invalid token or insufficient permissions)
- `404` - Not Found
- `500` - Internal Server Error

---

## Notes

1. **All dates** should be in `YYYY-MM-DD` format
2. **All amounts** should be numeric values
3. **Pagination** defaults: page=1, limit=10-50 depending on endpoint
4. **Admin routes** require admin role in JWT token
5. **Protected routes** require valid JWT token in Authorization header
6. **Seed data** is commented out - use APIs to add all data
