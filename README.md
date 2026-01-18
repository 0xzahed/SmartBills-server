# SmartBills Backend Server

Complete backend API for utility bill management system with authentication, CRUD operations, dashboard analytics, and AI features.

## Features

✅ **Authentication & Authorization**
- JWT-based authentication
- Role-based access control (User & Admin)
- Password hashing with bcrypt

✅ **Full CRUD Operations**
- Providers management
- Bills management
- User bills tracking
- Subscriptions
- Payments with email invoices
- Reviews & ratings

✅ **Advanced Features**
- Search, filter, sort, pagination
- Dashboard analytics with charts data
- AI chat assistant (Groq)
- Email notifications (SMTP)

✅ **Database**
- MongoDB with 8 collections
- No hardcoded seed data - all via APIs

## Installation

```bash
# Install dependencies
npm install

# Create .env file (copy from .env.example)
cp .env.example .env

# Update .env with your credentials
nano .env

# Start server
node index.js
```

## Environment Variables

Required variables in `.env`:

```env
PORT=3001
DB_USER=your_mongodb_username
DB_PASS=your_mongodb_password
DB_CLUSTER=your_cluster_url.mongodb.net
DB_NAME=BillManagementDB
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=7d
GROQ_API_KEY=your_groq_api_key
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
```

## API Endpoints Summary

### Authentication (No Auth Required)
```
POST   /auth/register          - Register new user
POST   /auth/login             - Login user
```

### User Profile (Auth Required)
```
GET    /users/profile          - Get user profile
PUT    /users/profile          - Update profile
```

### Providers (Admin for POST/PUT/DELETE)
```
GET    /providers              - Get all providers (search, filter, paginate)
GET    /providers/:id          - Get single provider
POST   /providers              - Create provider (Admin)
PUT    /providers/:id          - Update provider (Admin)
DELETE /providers/:id          - Delete provider (Admin)
```

### Bills - Public Templates (Admin for POST/PUT/DELETE)
```
GET    /bills                  - Get all bills (search, filter, paginate)
GET    /bills/:id              - Get single bill
POST   /bills                  - Create bill (Admin)
PUT    /bills/:id              - Update bill (Admin)
DELETE /bills/:id              - Delete bill (Admin)
```

### My Bills - User's Personal Bills (Auth Required)
```
GET    /mybills                - Get user's bills (search, filter, paginate)
POST   /mybills                - Create user bill
PUT    /mybills/:id            - Update user bill
DELETE /mybills/:id            - Delete user bill
```

### Subscriptions
```
GET    /subscriptions          - Get subscriptions
POST   /subscriptions          - Create subscription
```

### Payments
```
GET    /payments               - Get payments
POST   /payments/complete      - Record payment (sends email invoice)
```

### Dashboard Analytics (Auth Required)
```
GET    /dashboard/stats        - User dashboard stats (charts data)
GET    /dashboard/admin/stats  - Admin dashboard stats (Admin only)
```

### Reviews & Ratings
```
GET    /reviews                - Get reviews for provider
POST   /reviews                - Create review (Auth)
DELETE /reviews/:id            - Delete review (Auth - own or admin)
```

### AI Features
```
POST   /ai/chat                - Chat with AI assistant
POST   /ai/insights            - Get AI spending insights
```

## Database Collections

1. **users** - User accounts with authentication
2. **providers** - Utility service providers
3. **bills** - Public bill templates
4. **myBills** - User's personal bills
5. **subscriptions** - User subscriptions to providers
6. **payments** - Payment records
7. **reviews** - Provider reviews and ratings
8. **chatLogs** - AI chat history

## Creating Admin User

After server is running, register a user normally, then manually update the role in MongoDB:

```javascript
// In MongoDB Shell or Compass
db.users.updateOne(
  { email: "admin@smartbills.com" },
  { $set: { role: "admin" } }
)
```

Or use MongoDB Compass to change role from "user" to "admin".

## Testing the API

### Using cURL

```bash
# Register
curl -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"test123"}'

# Login
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'

# Create Provider (Admin only)
curl -X POST http://localhost:3001/providers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"name":"Test Provider","type":"Electricity"}'

# Get Providers
curl http://localhost:3001/providers?page=1&limit=10
```

### Using Postman or Thunder Client

Import these common requests:
1. Set `Authorization` header: `Bearer <token>`
2. Set `Content-Type` header: `application/json`
3. Use JSON body for POST/PUT requests

## Key Features for Assignment Requirements

✅ **Authentication**: JWT-based with role-based access
✅ **CRUD**: Full CRUD for providers, bills, mybills, reviews
✅ **Search**: Text search on multiple fields
✅ **Filter**: Multiple filter options (category, price range, date, etc.)
✅ **Sort**: Sort by any field (asc/desc)
✅ **Pagination**: Configurable page size with metadata
✅ **Dashboard**: Real analytics data with aggregation
✅ **Reviews**: Rating system with CRUD operations
✅ **Profile**: Editable user profiles
✅ **Email**: Automated invoice emails
✅ **AI**: Chat assistant and insights

## Production Deployment

### For Vercel:
Already configured with `vercel.json`. Just push to GitHub and connect to Vercel.

### Environment Variables on Vercel:
Add all `.env` variables in Vercel dashboard under Settings > Environment Variables.

## Security Notes

1. Change `JWT_SECRET` in production
2. Use strong MongoDB passwords
3. Enable MongoDB IP whitelist
4. Use HTTPS in production
5. Rate limiting is recommended (express-rate-limit)

## Support

For issues or questions, check `API_DOCUMENTATION.md` for detailed endpoint documentation.

## License

ISC
