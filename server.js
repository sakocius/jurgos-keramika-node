// @ts-nocheck
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();

const allowedOrigins = ['http://localhost:4200', 'https://jurgoskeramika.lt', 'https://www.jurgoskeramika.lt', 'https://jurgos-keramika-ng.vercel.app'];

app.use(
	cors({
		origin: (origin, callback) => {
			if (!origin) return callback(null, true);

			if (allowedOrigins.some((o) => origin.startsWith(o))) {
				return callback(null, true);
			}

			return callback(null, false);
		},
		credentials: true
	})
);

app.use(express.json());

app.post('/create-checkout-session', async (req, res) => {
	try {
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
