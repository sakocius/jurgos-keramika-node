// @ts-nocheck
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();

app.use(cors());
app.use(express.json());

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
