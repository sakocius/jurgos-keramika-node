// @ts-nocheck
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Resend = require('resend');

const app = express();

app.use(cors());

const resend = new Resend(process.env.RESEND_API_KEY);

app.post('/stripe-payment-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
	const signature = req.headers['stripe-signature'];

	let event;
	try {
		event = stripe.webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET);
	} catch (err) {
		return res.status(400).send(`Webhook Error: ${err.message}`);
	}

	if (event.type === 'checkout.session.completed') {
		const session = event.data.object;

		let cartItems = [];
		if (session.metadata && session.metadata.cart) {
			try {
				cartItems = JSON.parse(session.metadata.cart);
			} catch (err) {
				console.error('Invalid cart metadata JSON', err);
			}
		}

		if (cartItems.length > 0) {
			const conn = await pool.getConnection();
			try {
				await conn.beginTransaction();

				for (const item of cartItems) {
					const [result] = await conn.execute('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?', [item.count, item.id, item.count]);

					if (result.affectedRows === 0) {
						throw new Error(`Insufficient stock for product ${item.id}`);
					}
				}

				await conn.commit();
			} catch (err) {
				await conn.rollback();
				console.error('Inventory update failed', err);
				return res.status(500).send('Inventory update failed');
			} finally {
				conn.release();
			}
		}
	}

	res.json({ received: true });
});

app.use(express.json());

// Create connection pool (recommended for production)
const pool = mysql.createPool({
	host: process.env.DB_HOST,
	port: process.env.DB_PORT,
	user: process.env.DB_USER,
	password: process.env.DB_PASS,
	database: process.env.DB_NAME,
	waitForConnections: true,
	connectionLimit: 10,
	queueLimit: 0
});

// GET all product images from sql
app.get('/api/product-images', async (req, res) => {
	try {
		const [rows] = await pool.execute('SELECT * FROM product_images');

		if (rows.length === 0) {
			return res.status(404).json({ message: 'Not found' });
		}

		res.json(rows);
	} catch (error) {
		console.error(error);
		res.status(500).json({ message: 'Server error' });
	}
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

// send email from contact form

app.post('/api/contact', async (req, res) => {
	const { name, email, phone, message } = req.body;

	const messageFormatted = `Vardas: ${name}
		El. paštas: ${email ?? 'nepateiktas'}
		Telefonas: ${phone ?? 'nepateiktas'}
		Žinutė: ${message}`;

	try {
		await resend.emails.send({
			from: email,
			to: 'j.grigariene@gmail.com',
			subject: `Nauja žinutė nuo ${name}`,
			reply_to: email,
			text: messageFormatted
		});

		res.json({ success: true });
	} catch (err) {
		console.error('Email failed:', err);
		res.status(500).json({ success: false });
	}
});

// create checkout session to pay for products
app.post('/create-checkout-session', async (req, res) => {
	try {
		console.log('Received request to create checkout session with body:', req.body);
		const cartItems = req.body.cartItems ?? [];
		const shippingCost = (req.body.shippingCost ?? 10) * 100; // Default to 10 EUR if not provided

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
							amount: shippingCost,
							currency: 'eur'
						},
						display_name: 'Standard'
					}
				}
			],
			mode: 'payment',
			metadata: {
				cart: JSON.stringify(cartItems)
			},
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
