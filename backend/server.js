const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 9193; // Changed port to 8081

// MongoDB Connection URL - Replace with your actual connection string if different
const mongoUrl = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const dbName = 'restaurantDB';
let db;

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // Parse JSON bodies
app.use(express.static('../frontend')); // Serve frontend files

// Connect to MongoDB
async function connectDB() {
    try {
        const client = new MongoClient(mongoUrl);
        await client.connect();
        db = client.db(dbName);
        console.log(`Connected to MongoDB: ${dbName}`);

        // Create collections if they don't exist and add indexes
        const menuCollection = db.collection('menu');
        await menuCollection.createIndex({ name: 1 });
        await menuCollection.createIndex({ category: 1 });
        await menuCollection.createIndex({ tags: 1 });

        const ordersCollection = db.collection('orders');
        await ordersCollection.createIndex({ customerId: 1 }); // Assuming you'll have customerId
        await ordersCollection.createIndex({ timestamp: -1 });
        await ordersCollection.createIndex({ status: 1 });

        console.log('Indexes created for menu and orders collections.');

    } catch (err) {
        console.error('Failed to connect to MongoDB or create indexes', err);
        process.exit(1); // Exit process with failure
    }
}

// Start the server
async function startServer() {
    await connectDB(); // Ensure DB is connected before starting server
    app.listen(port, () => {
        console.log(`Backend server running at http://localhost:${port}`);
    });
}

startServer();

// Remove the following duplicate route definitions:
/*
// Example: GET orders (with filtering and pagination)
app.get('/api/orders', async (req, res) => {
    // Implementation similar to GET /api/menu with relevant filters for orders
    // (e.g., by customerId, status, date range)
    try {
        // Basic example: Get all orders
        const orders = await db.collection('orders').find({}).sort({ timestamp: -1 }).toArray();
        res.json(orders);
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({ message: 'Error fetching orders', error: error.message });
    }
});

// Example: PUT (update) an order status
app.put('/api/orders/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid order ID format.' });
        }

        if (!status) {
            return res.status(400).json({ message: 'Status is required.' });
        }

        // You might want to validate allowed status transitions
        const allowedStatuses = ['Placed', 'In Preparation', 'Ready', 'Delivered', 'Cancelled'];
        if (!allowedStatuses.includes(status)){
            return res.status(400).json({ message: `Invalid status. Allowed statuses are: ${allowedStatuses.join(', ')}` });
        }

        const result = await db.collection('orders').updateOne(
            { _id: new ObjectId(id) },
            { $set: { status: status, updatedAt: new Date() } }
        );
        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Order not found' });
        }

        const updatedOrder = await db.collection('orders').findOne({ _id: new ObjectId(id) });
        res.json(updatedOrder);
    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({ message: 'Error updating order status', error: error.message });
    }
});
*/

// --- Aggregation and Analytics Routes (Examples) --- //

// GET sales reports (example: daily sales for the last 7 days)
app.get('/api/analytics/sales-report', async (req, res) => {
    try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const report = await db.collection('orders').aggregate([
            { $match: { timestamp: { $gte: sevenDaysAgo }, status: 'Delivered' } }, // Consider only delivered orders for sales
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
                    totalSales: { $sum: '$totalAmount' }, // Assuming orders have a 'totalAmount' field
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]).toArray();
        res.json(report);
    } catch (error) {
        console.error('Error generating sales report:', error);
        res.status(500).json({ message: 'Error generating sales report', error: error.message });
    }
});

// GET most ordered dishes
app.get('/api/analytics/most-ordered-dishes', async (req, res) => {
    try {
        const report = await db.collection('orders').aggregate([
            { $match: { status: 'Delivered' } }, // Or all statuses if you want to see attempts too
            { $unwind: '$items' }, // Assuming 'items' is an array of objects with 'itemId' and 'quantity'
            {
                $group: {
                    _id: '$items.itemId', // or '$items.name' if you store name directly
                    totalOrdered: { $sum: '$items.quantity' }
                }
            },
            { $sort: { totalOrdered: -1 } },
            { $limit: 10 }, // Top 10
            // Optional: Lookup item details from menu collection
            {
                $lookup: {
                    from: 'menu',
                    localField: '_id',
                    foreignField: '_id', // Assuming items.itemId refers to _id in menu collection
                    as: 'menuItemDetails'
                }
            },
            { $unwind: { path: "$menuItemDetails", preserveNullAndEmptyArrays: true } } // preserve if item was deleted from menu
        ]).toArray();
        res.json(report);
    } catch (error) {
        console.error('Error fetching most ordered dishes:', error);
        res.status(500).json({ message: 'Error fetching most ordered dishes', error: error.message });
    }
});

// --- CRUD Routes for Menu Items --- //

// POST a new menu item
app.post('/api/menu', async (req, res) => {
    try {
        const newItem = req.body; // This contains the data sent from the frontend

        // Basic validation (you should expand this)
        if (!newItem.name || !newItem.price || !newItem.category) {
            return res.status(400).json({ message: 'Missing required fields: name, price, category' });
        }

        // Add creation timestamp
        newItem.createdAt = new Date();
        newItem.updatedAt = new Date();

        const result = await db.collection('menu').insertOne(newItem);
        // Respond with the newly created item, including its _id
        const createdItem = await db.collection('menu').findOne({ _id: result.insertedId });
        res.status(201).json({ message: 'Menu item added successfully', data: createdItem });

    } catch (error) {
        console.error('Error adding menu item:', error);
        res.status(500).json({ message: 'Error adding menu item', error: error.message });
    }
});

// GET all menu items (you might already have a similar route or want to enhance this)
app.get('/api/menu', async (req, res) => {
    try {
        const items = await db.collection('menu').find({}).toArray();
        res.json({ message: 'Menu items fetched successfully', data: items });
    } catch (error) {
        console.error('Error fetching menu items:', error);
        res.status(500).json({ message: 'Error fetching menu items', error: error.message });
    }
});

// GET a single menu item by ID
app.get('/api/menu/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid menu item ID format.' });
        }
        const item = await db.collection('menu').findOne({ _id: new ObjectId(id) });
        if (!item) {
            return res.status(404).json({ message: 'Menu item not found' });
        }
        res.json({ message: 'Menu item fetched successfully', data: item });
    } catch (error) {
        console.error('Error fetching menu item:', error);
        res.status(500).json({ message: 'Error fetching menu item', error: error.message });
    }
});

// PUT (update) a menu item by ID
app.put('/api/menu/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid menu item ID format.' });
        }

        // Remove _id from updates if present, as it shouldn't be changed
        delete updates._id;
        updates.updatedAt = new Date(); // Update the timestamp

        const result = await db.collection('menu').updateOne(
            { _id: new ObjectId(id) },
            { $set: updates }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Menu item not found for update' });
        }
        const updatedItem = await db.collection('menu').findOne({ _id: new ObjectId(id) });
        res.json({ message: 'Menu item updated successfully', data: updatedItem });
    } catch (error) {
        console.error('Error updating menu item:', error);
        res.status(500).json({ message: 'Error updating menu item', error: error.message });
    }
});

// DELETE a menu item by ID
app.delete('/api/menu/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid menu item ID format.' });
        }
        const result = await db.collection('menu').deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Menu item not found for deletion' });
        }
        res.status(200).json({ message: 'Menu item deleted successfully' }); // Or res.status(204).send(); for no content
    } catch (error) {
        console.error('Error deleting menu item:', error);
        res.status(500).json({ message: 'Error deleting menu item', error: error.message });
    }
});

// Root route for basic check
app.get('/', (req, res) => {
    res.send('Restaurant App Backend is running!');
});

// Start the server
// app.listen(port, () => {  // REMOVE THIS LINE
//     console.log(`Backend server running at http://localhost:${port}`); // AND THIS LINE
// }); // AND THIS LINE

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    // await client.close(); // Ensure MongoDB client is accessible here or close it in connectDB's scope if error
    console.log('MongoDB connection closed.');
    process.exit(0);
});

// Global error handler (optional but good practice)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// POST a new order
app.post('/api/orders', async (req, res) => {
    try {
        const newOrder = req.body; // This contains the order data from the frontend

        // Basic validation (you should expand this based on your order structure)
        if (!newOrder || !newOrder.items || newOrder.items.length === 0) {
            return res.status(400).json({ message: 'Order must contain items.' });
        }

        // Add creation timestamp
        newOrder.createdAt = new Date();

        // Assuming you have an 'orders' collection
        const result = await db.collection('orders').insertOne(newOrder);

        // Respond with the newly created order, including its _id
        const createdOrder = await db.collection('orders').findOne({ _id: result.insertedId });
        res.status(201).json({ message: 'Order placed successfully', data: createdOrder });

    } catch (error) {
        console.error('Error placing order:', error);
        res.status(500).json({ message: 'Error placing order', error: error.message });
    }
});

// --- CRUD Routes for Menu Items --- //

// PUT (update) a menu item by ID
app.put('/api/menu/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid menu item ID format.' });
        }

        // Remove _id from updates if present, as it shouldn't be changed
        delete updates._id;
        updates.updatedAt = new Date(); // Update the timestamp

        const result = await db.collection('menu').updateOne(
            { _id: new ObjectId(id) },
            { $set: updates }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Menu item not found for update' });
        }
        const updatedItem = await db.collection('menu').findOne({ _id: new ObjectId(id) });
        res.json({ message: 'Menu item updated successfully', data: updatedItem });
    } catch (error) {
        console.error('Error updating menu item:', error);
        res.status(500).json({ message: 'Error updating menu item', error: error.message });
    }
});

// DELETE a menu item by ID
app.delete('/api/menu/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid menu item ID format.' });
        }
        const result = await db.collection('menu').deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Menu item not found for deletion' });
        }
        res.status(200).json({ message: 'Menu item deleted successfully' }); // Or res.status(204).send(); for no content
    } catch (error) {
        console.error('Error deleting menu item:', error);
        res.status(500).json({ message: 'Error deleting menu item', error: error.message });
    }
});

// Root route for basic check
app.get('/', (req, res) => {
    res.send('Restaurant App Backend is running!');
});

// Start the server
// app.listen(port, () => {  // REMOVE THIS LINE
//     console.log(`Backend server running at http://localhost:${port}`); // AND THIS LINE
// }); // AND THIS LINE

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    // await client.close(); // Ensure MongoDB client is accessible here or close it in connectDB's scope if error
    console.log('MongoDB connection closed.');
    process.exit(0);
});

// Global error handler (optional but good practice)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// PUT (update) a menu item by ID
app.put('/api/menu/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid menu item ID format.' });
        }

        // Remove _id from updates if present, as it shouldn't be changed
        delete updates._id;
        updates.updatedAt = new Date(); // Update the timestamp

        const result = await db.collection('menu').updateOne(
            { _id: new ObjectId(id) },
            { $set: updates }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Menu item not found for update' });
        }
        const updatedItem = await db.collection('menu').findOne({ _id: new ObjectId(id) });
        res.json({ message: 'Menu item updated successfully', data: updatedItem });
    } catch (error) {
        console.error('Error updating menu item:', error);
        res.status(500).json({ message: 'Error updating menu item', error: error.message });
    }
});

// DELETE a menu item by ID
app.delete('/api/menu/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid menu item ID format.' });
        }
        const result = await db.collection('menu').deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Menu item not found for deletion' });
        }
        res.status(200).json({ message: 'Menu item deleted successfully' }); // Or res.status(204).send(); for no content
    } catch (error) {
        console.error('Error deleting menu item:', error);
        res.status(500).json({ message: 'Error deleting menu item', error: error.message });
    }
});

// Root route for basic check
app.get('/', (req, res) => {
    res.send('Restaurant App Backend is running!');
});

// Start the server
// app.listen(port, () => {  // REMOVE THIS LINE
//     console.log(`Backend server running at http://localhost:${port}`); // AND THIS LINE
// }); // AND THIS LINE

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    // await client.close(); // Ensure MongoDB client is accessible here or close it in connectDB's scope if error
    console.log('MongoDB connection closed.');
    process.exit(0);
});

// Global error handler (optional but good practice)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// PUT (update) a menu item by ID
app.put('/api/menu/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid menu item ID format.' });
        }

        // Remove _id from updates if present, as it shouldn't be changed
        delete updates._id;
        updates.updatedAt = new Date(); // Update the timestamp

        const result = await db.collection('menu').updateOne(
            { _id: new ObjectId(id) },
            { $set: updates }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Menu item not found for update' });
        }
        const updatedItem = await db.collection('menu').findOne({ _id: new ObjectId(id) });
        res.json({ message: 'Menu item updated successfully', data: updatedItem });
    } catch (error) {
        console.error('Error updating menu item:', error);
        res.status(500).json({ message: 'Error updating menu item', error: error.message });
    }
});

// DELETE a menu item by ID
app.delete('/api/menu/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid menu item ID format.' });
        }
        const result = await db.collection('menu').deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Menu item not found for deletion' });
        }
        res.status(200).json({ message: 'Menu item deleted successfully' }); // Or res.status(204).send(); for no content
    } catch (error) {
        console.error('Error deleting menu item:', error);
        res.status(500).json({ message: 'Error deleting menu item', error: error.message });
    }
});

// Root route for basic check
app.get('/', (req, res) => {
    res.send('Restaurant App Backend is running!');
});

// Start the server
// app.listen(port, () => {  // REMOVE THIS LINE
//     console.log(`Backend server running at http://localhost:${port}`); // AND THIS LINE
// }); // AND THIS LINE

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    // await client.close(); // Ensure MongoDB client is accessible here or close it in connectDB's scope if error
    console.log('MongoDB connection closed.');
    process.exit(0);
});

// Global error handler (optional but good practice)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// PUT (update) a menu item by ID
app.put('/api/menu/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid menu item ID format.' });
        }

        // Remove _id from updates if present, as it shouldn't be changed
        delete updates._id;
        updates.updatedAt = new Date(); // Update the timestamp

        const result = await db.collection('menu').updateOne(
            { _id: new ObjectId(id) },
            { $set: updates }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Menu item not found for update' });
        }
        const updatedItem = await db.collection('menu').findOne({ _id: new ObjectId(id) });
        res.json({ message: 'Menu item updated successfully', data: updatedItem });
    } catch (error) {
        console.error('Error updating menu item:', error);
        res.status(500).json({ message: 'Error updating menu item', error: error.message });
    }
});

// DELETE a menu item by ID
app.delete('/api/menu/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid menu item ID format.' });
        }
        const result = await db.collection('menu').deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Menu item not found for deletion' });
        }
        res.status(200).json({ message: 'Menu item deleted successfully' }); // Or res.status(204).send(); for no content
    } catch (error) {
        console.error('Error deleting menu item:', error);
        res.status(500).json({ message: 'Error deleting menu item', error: error.message });
    }
});

// Root route for basic check
app.get('/', (req, res) => {
    res.send('Restaurant App Backend is running!');
});

// Start the server
// app.listen(port, () => {  // REMOVE THIS LINE
//     console.log(`Backend server running at http://localhost:${port}`); // AND THIS LINE
// }); // AND THIS LINE

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    // await client.close(); // Ensure MongoDB client is accessible here or close it in connectDB's scope if error
    console.log('MongoDB connection closed.');
    process.exit(0);
});

// Global error handler (optional but good practice)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// PUT (update) a menu item by ID
app.put('/api/menu/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid menu item ID format.' });
        }

        // Remove _id from updates if present, as it shouldn't be changed
        delete updates._id;
        updates.updatedAt = new Date(); // Update the timestamp

        const result = await db.collection('menu').updateOne(
            { _id: new ObjectId(id) },
            { $set: updates }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Menu item not found for update' });
        }
        const updatedItem = await db.collection('menu').findOne({ _id: new ObjectId(id) });
        res.json({ message: 'Menu item updated successfully', data: updatedItem });
    } catch (error) {
        console.error('Error updating menu item:', error);
        res.status(500).json({ message: 'Error updating menu item', error: error.message });
    }
});

// DELETE a menu item by ID
app.delete('/api/menu/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid menu item ID format.' });
        }
        const result = await db.collection('menu').deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Menu item not found for deletion' });
        }
        res.status(200).json({ message: 'Menu item deleted successfully' }); // Or res.status(204).send(); for no content
    } catch (error) {
        console.error('Error deleting menu item:', error);
        res.status(500).json({ message: 'Error deleting menu item', error: error.message });
    }
});

// Root route for basic check
app.get('/', (req, res) => {
    res.send('Restaurant App Backend is running!');
});

// Start the server
// app.listen(port, () => {  // REMOVE THIS LINE
//     console.log(`Backend server running at http://localhost:${port}`); // AND THIS LINE
// }); // AND THIS LINE

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    // await client.close(); // Ensure MongoDB client is accessible here or close it in connectDB's scope if error
    console.log('MongoDB connection closed.');
    process.exit(0);
});

// Global error handler (optional but good practice)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// PUT (update) a menu item by ID
app.put('/api/menu/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid menu item ID format.' });
        }

        // Remove _id from updates if present, as it shouldn't be changed
        delete updates._id;
        updates.updatedAt = new Date(); // Update the timestamp

        const result = await db.collection('menu').updateOne(
            { _id: new ObjectId(id) },
            { $set: updates }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Menu item not found for update' });
        }
        const updatedItem = await db.collection('menu').findOne({ _id: new ObjectId(id) });
        res.json({ message: 'Menu item updated successfully', data: updatedItem });
    } catch (error) {
        console.error('Error updating menu item:', error);
        res.status(500).json({ message: 'Error updating menu item', error: error.message });
    }
});

// DELETE a menu item by ID
app.delete('/api/menu/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid menu item ID format.' });
        }
        const result = await db.collection('menu').deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Menu item not found for deletion' });
        }
        res.status(200).json({ message: 'Menu item deleted successfully' }); // Or res.status(204).send(); for no content
    } catch (error) {
        console.error('Error deleting menu item:', error);
        res.status(500).json({ message: 'Error deleting menu item', error: error.message });
    }
});

// Root route for basic check
app.get('/', (req, res) => {
    res.send('Restaurant App Backend is running!');
});

// Start the server
// app.listen(port, () => {  // REMOVE THIS LINE
//     console.log(`Backend server running at http://localhost:${port}`); // AND THIS LINE
// }); // AND THIS LINE

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    // await client.close(); // Ensure MongoDB client is accessible here or close it in connectDB's scope if error
    console.log('MongoDB connection closed.');
    process.exit(0);
});

// Global error handler (optional but good practice)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// PUT (update) a menu item by ID
app.put('/api/menu/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid menu item ID format.' });
        }

        // Remove _id from updates if present, as it shouldn't be changed
        delete updates._id;
        updates.updatedAt = new Date(); // Update the timestamp

        const result = await db.collection('menu').updateOne(
            { _id: new ObjectId(id) },
            { $set: updates }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Menu item not found for update' });
        }
        const updatedItem = await db.collection('menu').findOne({ _id: new ObjectId(id) });
        res.json({ message: 'Menu item updated successfully', data: updatedItem });
    } catch (error) {
        console.error('Error updating menu item:', error);
        res.status(500).json({ message: 'Error updating menu item', error: error.message });
    }
});

// DELETE a menu item by ID
app.delete('/api/menu/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid menu item ID format.' });
        }
        const result = await db.collection('menu').deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Menu item not found for deletion' });
        }
        res.status(200).json({ message: 'Menu item deleted successfully' }); // Or res.status(204).send(); for no content
    } catch (error) {
        console.error('Error deleting menu item:', error);
        res.status(500).json({ message: 'Error deleting menu item', error: error.message });
    }
});

// Root route for basic check
app.get('/', (req, res) => {
    res.send('Restaurant App Backend is running!');
});

// Start the server
// app.listen(port, () => {  // REMOVE THIS LINE
//     console.log(`Backend server running at http://localhost:${port}`); // AND THIS LINE
// }); // AND THIS LINE

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    // await client.close(); // Ensure MongoDB client is accessible here or close it in connectDB's scope if error
    console.log('MongoDB connection closed.');
    process.exit(0);
});

// Global error handler (optional but good practice)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// PUT (update) a menu item by ID
app.put('/api/menu/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid menu item ID format.' });
        }

        // Remove _id from updates if present, as it shouldn't be changed
        delete updates._id;
        updates.updatedAt = new Date(); // Update the timestamp

        const result = await db.collection('menu').updateOne(
            { _id: new ObjectId(id) },
            { $set: updates }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Menu item not found for update' });
        }
        const updatedItem = await db.collection('menu').findOne({ _id: new ObjectId(id) });
        res.json({ message: 'Menu item updated successfully', data: updatedItem });
    } catch (error) {
        console.error('Error updating menu item:', error);
        res.status(500).json({ message: 'Error updating menu item', error: error.message });
    }
});

// DELETE a menu item by ID
app.delete('/api/menu/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid menu item ID format.' });
        }
        const result = await db.collection('menu').deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Menu item not found for deletion' });
        }
        res.status(200).json({ message: 'Menu item deleted successfully' }); // Or res.status(204).send(); for no content
    } catch (error) {
        console.error('Error deleting menu item:', error);
        res.status(500).json({ message: 'Error deleting menu item', error: error.message });
    }
});

// Root route for basic check
app.get('/', (req, res) => {
    res.send('Restaurant App Backend is running!');
});

// Start the server
// app.listen(port, () => {  // REMOVE THIS LINE
//     console.log(`Backend server running at http://localhost:${port}`); // AND THIS LINE
// }); // AND THIS LINE

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    // await client.close(); // Ensure MongoDB client is accessible here or close it in connectDB's scope if error
    console.log('MongoDB connection closed.');
    process.exit(0);
});

// Global error handler (optional but good practice)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// PUT (update) a menu item by ID
app.put('/api/menu/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid menu item ID format.' });
        }

        // Remove _id from updates if present, as it shouldn't be changed
        delete updates._id;
        updates.updatedAt = new Date(); // Update the timestamp

        const result = await db.collection('menu').updateOne(
            { _id: new ObjectId(id) },
            { $set: updates }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Menu item not found for update' });
        }
        const updatedItem = await db.collection('menu').findOne({ _id: new ObjectId(id) });
        res.json({ message: 'Menu item updated successfully', data: updatedItem });
    } catch (error) {
        console.error('Error updating menu item:', error);
        res.status(500).json({ message: 'Error updating menu item', error: error.message });
    }
});

// DELETE a menu item by ID
app.delete('/api/menu/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid menu item ID format.' });
        }
        const result = await db.collection('menu').deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Menu item not found for deletion' });
        }
        res.status(200).json({ message: 'Menu item deleted successfully' }); // Or res.status(204).send(); for no content
    } catch (error) {
        console.error('Error deleting menu item:', error);
        res.status(500).json({ message: 'Error deleting menu item', error: error.message });
    }
});

// Root route for basic check
app.get('/', (req, res) => {
    res.send('Restaurant App Backend is running!');
});

// Start the server
// app.listen(port, () => {  // REMOVE THIS LINE
//     console.log(`Backend server running at http://localhost:${port}`); // AND THIS LINE
// }); // AND THIS LINE

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    // await client.close(); // Ensure MongoDB client is accessible here or close it in connectDB's scope if error
    console.log('MongoDB connection closed.');
    process.exit(0);
});

// Global error handler (optional but good practice)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// PUT (update) a menu item by ID
app.put('/api/menu/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid menu item ID format.' });
        }

        // Remove _id from updates if present, as it shouldn't be changed
        delete updates._id;
        updates.updatedAt = new Date(); // Update the timestamp

        const result = await db.collection('menu').updateOne(
            { _id: new ObjectId(id) },
            { $set: updates }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Menu item not found for update' });
        }
        const updatedItem = await db.collection('menu').findOne({ _id: new ObjectId(id) });
        res.json({ message: 'Menu item updated successfully', data: updatedItem });
    } catch (error) {
        console.error('Error updating menu item:', error);
        res.status(500).json({ message: 'Error updating menu item', error: error.message });
    }
});

// DELETE a menu item by ID
app.delete('/api/menu/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid menu item ID format.' });
        }
        const result = await db.collection('menu').deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Menu item not found for deletion' });
        }
        res.status(200).json({ message: 'Menu item deleted successfully' }); // Or res.status(204).send(); for no content
    } catch (error) {
        console.error('Error deleting menu item:', error);
        res.status(500).json({ message: 'Error deleting menu item', error: error.message });
    }
});

// Root route for basic check
app.get('/', (req, res) => {
    res.send('Restaurant App Backend is running!');
});

// Start the server
// app.listen(port, () => {  // REMOVE THIS LINE
//     console.log(`Backend server running at http://localhost:${port}`); // AND THIS LINE
// }); // AND THIS LINE

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    // await client.close(); // Ensure MongoDB client is accessible here or close it in connectDB's scope if error
    console.log('MongoDB connection closed.');
    process.exit(0);
});

// Global error handler (optional but good practice)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// PUT (update) a menu item by ID
app.put('/api/menu/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid menu item ID format.' });
        }

        // Remove _id from updates if present, as it shouldn't be changed
        delete updates._id;
        updates.updatedAt = new Date(); // Update the timestamp

        const result = await db.collection('menu').updateOne(
            { _id: new ObjectId(id) },
            { $set: updates }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Menu item not found for update' });
        }
        const updatedItem = await db.collection('menu').findOne({ _id: new ObjectId(id) });
        res.json({ message: 'Menu item updated successfully', data: updatedItem });
    } catch (error) {
        console.error('Error updating menu item:', error);
        res.status(500).json({ message: 'Error updating menu item', error: error.message });
    }
});

// DELETE a menu item by ID
app.delete('/api/menu/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid menu item ID format.' });
        }
        const result = await db.collection('menu').deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Menu item not found for deletion' });
        }
        res.status(200).json({ message: 'Menu item deleted successfully' }); // Or res.status(204).send(); for no content
    } catch (error) {
        console.error('Error deleting menu item:', error);
        res.status(500).json({ message: 'Error deleting menu item', error: error.message });
    }
});

// Root route for basic check
app.get('/', (req, res) => {
    res.send('Restaurant App Backend is running!');
});

// Start the server
// app.listen(port, () => {  // REMOVE THIS LINE
//     console.log(`Backend server running at http://localhost:${port}`); // AND THIS LINE
// }); // AND THIS LINE

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    // await client.close(); // Ensure MongoDB client is accessible here or close it in connectDB's scope if error
    console.log('MongoDB connection closed.');
    process.exit(0);
});

// Global error handler (optional but good practice)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// PUT (update) a menu item by ID
app.put('/api/menu/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid menu item ID format.' });
        }

        // Remove _id from updates if present, as it shouldn't be changed
        delete updates._id;
        updates.updatedAt = new Date(); // Update the timestamp

        const result = await db.collection('menu').updateOne(
            { _id: new ObjectId(id) },
            { $set: updates }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Menu item not found for update' });
        }
        const updatedItem = await db.collection('menu').findOne({ _id: new ObjectId(id) });
        res.json({ message: 'Menu item updated successfully', data: updatedItem });
    } catch (error) {
        console.error('Error updating menu item:', error);
        res.status(500).json({ message: 'Error updating menu item', error: error.message });
    }
});

// DELETE a menu item by ID
app.delete('/api/menu/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid menu item ID format.' });
        }
        const result = await db.collection('menu').deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Menu item not found for deletion' });
        }
        res.status(200).json({ message: 'Menu item deleted successfully' }); // Or res.status(204).send(); for no content
    } catch (error) {
        console.error('Error deleting menu item:', error);
        res.status(500).json({ message: 'Error deleting menu item', error: error.message });
    }
});

// Root route for basic check
app.get('/', (req, res) => {
    res.send('Restaurant App Backend is running!');
});

// Start the server
// app.listen(port, () => {  // REMOVE THIS LINE
//     console.log(`Backend server running at http://localhost:${port}`); // AND THIS LINE
// }); // AND THIS LINE

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    // await client.close(); // Ensure MongoDB client is accessible here or close it in connectDB's scope if error
    console.log('MongoDB connection closed.');
    process.exit(0);
});

// Global error handler (optional but good practice)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// PUT (update) a menu item by ID
app.put('/api/menu/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid menu item ID format.' });
        }

        // Remove _id from updates if present, as it shouldn't be changed
        delete updates._id;
        updates.updatedAt = new Date(); // Update the timestamp

        const result = await db.collection('menu').updateOne(
            { _id: new ObjectId(id) },
            { $set: updates }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Menu item not found for update' });
        }
        const updatedItem = await db.collection('menu').findOne({ _id: new ObjectId(id) });
        res.json({ message: 'Menu item updated successfully', data: updatedItem });
    } catch (error) {
        console.error('Error updating menu item:', error);
        res.status(500).json({ message: 'Error updating menu item', error: error.message });
    }
});

// DELETE a menu item by ID
app.delete('/api/menu/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid menu item ID format.' });
        }
        const result = await db.collection('menu').deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Menu item not found for deletion' });
        }
        res.status(200).json({ message: 'Menu item deleted successfully' }); // Or res.status(204).send(); for no content
    } catch (error) {
        console.error('Error deleting menu item:', error);
        res.status(500).json({ message: 'Error deleting menu item', error: error.message });
    }
});

// Root route for basic check
app.get('/', (req, res) => {
    res.send('Restaurant App Backend is running!');
});

// Start the server
// app.listen(port, () => {  // REMOVE THIS LINE
//     console.log(`Backend server running at http://localhost:${port}`); // AND THIS LINE
// }); // AND THIS LINE

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    // await client.close(); // Ensure MongoDB client is accessible here or close it in connectDB's scope if error
    console.log('MongoDB connection closed.');
    process.exit(0);
});

// Global error handler (optional but good practice)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// PUT (update) a menu item by ID
app.put('/api/menu/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid menu item ID format.' });
        }

        // Remove _id from updates if present, as it shouldn't be changed
        delete updates._id;
        updates.updatedAt = new Date(); // Update the timestamp

        const result = await db.collection('menu').updateOne(
            { _id: new ObjectId(id) },
            { $set: updates }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Menu item not found for update' });
        }
        const updatedItem = await db.collection('menu').findOne({ _id: new ObjectId(id) });
        res.json({ message: 'Menu item updated successfully', data: updatedItem });
    } catch (error) {
        console.error('Error updating menu item:', error);
        res.status(500).json({ message: 'Error updating menu item', error: error.message });
    }
});

// DELETE a menu item by ID
app.delete('/api/menu/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid menu item ID format.' });
        }
        const result = await db.collection('menu').deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Menu item not found for deletion' });
        }
        res.status(200).json({ message: 'Menu item deleted successfully' }); // Or res.status(204).send(); for no content
    } catch (error) {
        console.error('Error deleting menu item:', error);
        res.status(500).json({ message: 'Error deleting menu item', error: error.message });
    }
});

// Root route for basic check
app.get('/', (req, res) => {
    res.send('Restaurant App Backend is running!');
});

// Start the server
// app.listen(port, () => {  // REMOVE THIS LINE
//     console.log(`Backend server running at http://localhost:${port}`); // AND THIS LINE
// }); // AND THIS LINE

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    // await client.close(); // Ensure MongoDB client is accessible here or close it in connectDB's scope if error
    console.log('MongoDB connection closed.');
    process.exit(0);
});

// Global error handler (optional but good practice)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// PUT (update) a menu item by ID
app.put('/api/menu/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid menu item ID format.' });
        }

        // Remove _id from updates if present, as it shouldn't be changed
        delete updates._id;
        updates.updatedAt = new Date(); // Update the timestamp

        const result = await db.collection('menu').updateOne(
            { _id: new ObjectId(id) },
            { $set: updates }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Menu item not found for update' });
        }
        const updatedItem = await db.collection('menu').findOne({ _id: new ObjectId(id) });
        res.json({ message: 'Menu item updated successfully', data: updatedItem });
    } catch (error) {
        console.error('Error updating menu item:', error);
        res.status(500).json({ message: 'Error updating menu item', error: error.message });
    }
});

// DELETE a menu item by ID
app.delete('/api/menu/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid menu item ID format.' });
        }
        const result = await db.collection('menu').deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Menu item not found for deletion' });
        }
        res.status(200).json({ message: 'Menu item deleted successfully' }); // Or res.status(204).send(); for no content
    } catch (error) {
        console.error('Error deleting menu item:', error);
        res.status(500).json({ message: 'Error deleting menu item', error: error.message });
    }
});

// Root route for basic check
app.get('/', (req, res) => {
    res.send('Restaurant App Backend is running!');
});

// Start the server
// app.listen(port, () => {  // REMOVE THIS LINE
//     console.log(`Backend server running at http://localhost:${port}`); // AND THIS LINE
// }); // AND THIS LINE

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    // await client.close(); // Ensure MongoDB client is accessible here or close it in connectDB's scope if error
    console.log('MongoDB connection closed.');
    process.exit(0);
});

// Global error handler (optional but good practice)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// PUT (update) a menu item by ID
app.put('/api/menu/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid menu item ID format.' });
        }

        // Remove _id from updates if present, as it shouldn't be changed
        delete updates._id;
        updates.updatedAt = new Date(); // Update the timestamp

        const result = await db.collection('menu').updateOne(
            { _id: new ObjectId(id) },
            { $set: updates }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Menu item not found for update' });
        }
        const updatedItem = await db.collection('menu').findOne({ _id: new ObjectId(id) });
        res.json({ message: 'Menu item updated successfully', data: updatedItem });
    } catch (error) {
        console.error('Error updating menu item:', error);
        res.status(500).json({ message: 'Error updating menu item', error: error.message });
    }
});

// DELETE a menu item by ID
app.delete('/api/menu/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid menu item ID format.' });
        }
        const result = await db.collection('menu').deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Menu item not found for deletion' });
        }
        res.status(200).json({ message: 'Menu item deleted successfully' }); // Or res.status(204).send(); for no content
    } catch (error) {
        console.error('Error deleting menu item:', error);
        res.status(500).json({ message: 'Error deleting menu item', error: error.message });
    }
});

// Root route for basic check
app.get('/', (req, res) => {
    res.send('Restaurant App Backend is running!');
});

// Start the server
// app.listen(port, () => {  // REMOVE THIS LINE
//     console.log(`Backend server running at http://localhost:${port}`); // AND THIS LINE
// }); // AND THIS LINE

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    // await client.close(); // Ensure MongoDB client is accessible here or close it in connectDB's scope if error
    console.log('MongoDB connection closed.');
    process.exit(0);
});

// Global error handler (optional but good practice)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// PUT (update) a menu item by ID
app.put('/api/menu/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid menu item ID format.' });
        }

        // Remove _id from updates if present, as it shouldn't be changed
        delete updates._id;
        updates.updatedAt = new Date(); // Update the timestamp

        const result = await db.collection('menu').updateOne(
            { _id: new ObjectId(id) },
            { $set: updates }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Menu item not found for update' });
        }
        const updatedItem = await db.collection('menu').findOne({ _id: new ObjectId(id) });
        res.json({ message: 'Menu item updated successfully', data: updatedItem });
    } catch (error) {
        console.error('Error updating menu item:', error);
        res.status(500).json({ message: 'Error updating menu item', error: error.message });
    }
});

// DELETE a menu item by ID
app.delete('/api/menu/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid menu item ID format.' });
        }
        const result = await db.collection('menu').deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Menu item not found for deletion' });
        }
        res.status(200).json({ message: 'Menu item deleted successfully' }); // Or res.status(204).send(); for no content
    } catch (error) {
        console.error('Error deleting menu item:', error);
        res.status(500).json({ message: 'Error deleting menu item', error: error.message });
    }
});

// Root route for basic check
app.get('/', (req, res) => {
    res.send('Restaurant App Backend is running!');
});

// Start the server
// app.listen(port, () => {  // REMOVE THIS LINE
//     console.log(`Backend server running at http://localhost:${port}`); // AND THIS LINE
// }); // AND THIS LINE

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    // await client.close(); // Ensure MongoDB client is accessible here or close it in connectDB's scope if error
    console.log('MongoDB connection closed.');
    process.exit(0);
});

// Global error handler (optional but good practice)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// PUT (update) a menu item by ID
app.put('/api/menu/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid menu item ID format.' });
        }

        // Remove _id from updates if present, as it shouldn't be changed
        delete updates._id;
        updates.updatedAt = new Date(); // Update the timestamp

        const result = await db.collection('menu').updateOne(
            { _id: new ObjectId(id) },
            { $set: updates }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Menu item not found for update' });
        }
        const updatedItem = await db.collection('menu').findOne({ _id: new ObjectId(id) });
        res.json({ message: 'Menu item updated successfully', data: updatedItem });
    } catch (error) {
        console.error('Error updating menu item:', error);
        res.status(500).json({ message: 'Error updating menu item', error: error.message });
    }
});

// DELETE a menu item by ID
app.delete('/api/menu/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid menu item ID format.' });
        }
        const result = await db.collection('menu').deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Menu item not found for deletion' });
        }
        res.status(200).json({ message: 'Menu item deleted successfully' }); // Or res.status(204).send(); for no content
    } catch (error) {
        console.error('Error deleting menu item:', error);
        res.status(500).json({ message: 'Error deleting menu item', error: error.message });
    }
});

// Root route for basic check
app.get('/', (req, res) => {
    res.send('Restaurant App Backend is running!');
});

// Start the server
// app.listen(port, () => {  // REMOVE THIS LINE
//     console.log(`Backend server running at http://localhost:${port}`); // AND THIS LINE
// }); // AND THIS LINE

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    // await client.close(); // Ensure MongoDB client is accessible here or close it in connectDB's scope if error
    console.log('MongoDB connection closed.');
    process.exit(0);
});

// Global error handler (optional but good practice)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// PUT (update) a menu item by ID
app.put('/api/menu/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid menu item ID format.' });
        }

        // Remove _id from updates if present, as it shouldn't be changed
        delete updates._id;
        updates.updatedAt = new Date(); // Update the timestamp

        const result = await db.collection('menu').updateOne(
            { _id: new ObjectId(id) },
            { $set: updates }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Menu item not found for update' });
        }
        const updatedItem = await db.collection('menu').findOne({ _id: new ObjectId(id) });
        res.json({ message: 'Menu item updated successfully', data: updatedItem });
    } catch (error) {
        console.error('Error updating menu item:', error);
        res.status(500).json({ message: 'Error updating menu item', error: error.message });
    }
});

// DELETE a menu item by ID
app.delete('/api/menu/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid menu item ID format.' });
        }
        const result = await db.collection('menu').deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Menu item not found for deletion' });
        }
        res.status(200).json({ message: 'Menu item deleted successfully' }); // Or res.status(204).send(); for no content
    } catch (error) {
        console.error('Error deleting menu item:', error);
        res.status(500).json({ message: 'Error deleting menu item', error: error.message });
    }
});

// Root route for basic check
app.get('/', (req, res) => {
    res.send('Restaurant App Backend is running!');
});

// Start the server
// app.listen(port, () => {  // REMOVE THIS LINE
//     console.log(`Backend server running at http://localhost:${port}`); // AND THIS LINE
// }); // AND THIS LINE

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    // await client.close(); // Ensure MongoDB client is accessible here or close it in connectDB's scope if error
    console.log('MongoDB connection closed.');
    process.exit(0);
});

// Global error handler (optional but good practice)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// PUT (update) a menu item by ID
app.put('/api/menu/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid menu item ID format.' });
        }

        // Remove _id from updates if present, as it shouldn't be changed
        delete updates._id;
        updates.updatedAt = new Date(); // Update the timestamp

        const result = await db.collection('menu').updateOne(
            { _id: new ObjectId(id) },
            { $set: updates }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Menu item not found for update' });
        }
        const updatedItem = await db.collection('menu').findOne({ _id: new ObjectId(id) });
        res.json({ message: 'Menu item updated successfully', data: updatedItem });
    } catch (error) {
        console.error('Error updating menu item:', error);
        res.status(500).json({ message: 'Error updating menu item', error: error.message });
    }
});

// DELETE a menu item by ID
app.delete('/api/menu/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid menu item ID format.' });
        }
        const result = await db.collection('menu').deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Menu item not found for deletion' });
        }
        res.status(200).json({ message: 'Menu item deleted successfully' }); // Or res.status(204).send(); for no content
    } catch (error) {
        console.error('Error deleting menu item:', error);
        res.status(500).json({ message: 'Error deleting menu item', error: error.message });
    }
});

// Root route for basic check
app.get('/', (req, res) => {
    res.send('Restaurant App Backend is running!');
});

// Start the server
// app.listen(port, () => {  // REMOVE THIS LINE
//     console.log(`Backend server running at http://localhost:${port}`); // AND THIS LINE
// }); // AND THIS LINE

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    // await client.close(); // Ensure MongoDB client is accessible here or close it in connectDB's scope if error
    console.log('MongoDB connection closed.');
    process.exit(0);
});
// Global error handler (optional but good practice)
