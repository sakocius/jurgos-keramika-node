// @ts-nocheck
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();

app.use(cors());
app.use(express.json());

// Create connection pool (recommended for production)
const pool = mysql.createPool({
	host: process.env.DB_HOST,
	port: process.env.DB_PORT,
	user: process.env.DB_USER,
	password: process.env.DB_PASSWORD,
	database: process.env.DB_NAME,
	waitForConnections: true,
	connectionLimit: 10,
	queueLimit: 0
});

// GET all products from sql
app.get('/api/products', async (req, res) => {
	try {
		const [rows] = await pool.execute('SELECT * FROM products');

		if (rows.length === 0) {
			return res.status(404).json({ message: 'Not found' });
		}

		res.json(rows);
	} catch (error) {
		console.error(error);
		res.status(500).json({ message: 'Server error' });
	}
});

// GET products from sql by ID
app.get('/api/products/:id', async (req, res) => {
	try {
		const { id } = req.params;

		const [rows] = await pool.execute('SELECT * FROM products WHERE id = ?', [id]);

		if (rows.length === 0) {
			return res.status(404).json({ message: 'Not found' });
		}

		res.json(rows[0]);
	} catch (error) {
		console.error(error);
		res.status(500).json({ message: 'Server error' });
	}
});

// get product list from stripe
app.get('/api/stripe/products', async (req, res) => {
	try {
		const products = await stripe.products.list({
			active: true,
			expand: ['data.default_price']
		});

		res.json(products.data);
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

// create checkout session to pay for products
app.post('/create-checkout-session', async (req, res) => {
	try {
		console.log('Received request to create checkout session with body:', req.body);
		const cartItems = req.body.cartItems ?? [];

		const session = await stripe.checkout.sessions.create({
			payment_method_types: ['card'],
			shipping_address_collection: {
				allowed_countries: ['LT']
			},
			shipping_options: [
				{
					shipping_rate_data: {
						type: 'fixed_amount',
						fixed_amount: {
							amount: 1000,
							currency: 'eur'
						},
						display_name: 'Standard'
					}
				}
			],
			mode: 'payment',
			// @ts-ignore
			line_items: cartItems.map((item) => ({
				price_data: {
					currency: 'eur',
					product_data: {
						name: `${item.title} (#${item.id})`
					},
					unit_amount: Math.ceil(item.price * 100)
				},
				quantity: item.count
			})),

			success_url: `${process.env.FRONTEND_URL}/payment-success`,
			cancel_url: `${process.env.FRONTEND_URL}/payment-cancel`
		});

		res.json({ url: session.url });
	} catch (err) {
		// @ts-ignore
		res.status(500).json({ error: err.message });
	}
});

const port = process.env.PORT || 4242;

app.listen(port, '0.0.0.0', () => {
	console.log(`Server running on port ${port}`);
});
