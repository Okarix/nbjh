import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
app.use(cors());
app.use(express.json());

const AMO_BASE_URL = "https://mounirmasterclass.amocrm.ru";
const AMO_TOKEN =
	"eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6ImQ4MzM0NWEyY2Q0ZjllN2NkYTJlYWYxMmJkMTRjMzUxODdlOTA2NGJmYWEzMDYxNWIxYWY4NTlkMTA5MzI3ZTM2YzM0YTA3NmNhMTM3YjRhIn0.eyJhdWQiOiJjOWQyOThjZS0wNzY5LTQ1ZDgtODRhNy1mZmQ1YzBjZmI0NTgiLCJqdGkiOiJkODMzNDVhMmNkNGY5ZTdjZGEyZWFmMTJiZDE0YzM1MTg3ZTkwNjRiZmFhMzA2MTViMWFmODU5ZDEwOTMyN2UzNmMzNGEwNzZjYTEzN2I0YSIsImlhdCI6MTc2NDY5NDgwNCwibmJmIjoxNzY0Njk0ODA0LCJleHAiOjE3OTM0MDQ4MDAsInN1YiI6IjEzMjQxMTUwIiwiZ3JhbnRfdHlwZSI6IiIsImFjY291bnRfaWQiOjMyNzc3MDk4LCJiYXNlX2RvbWFpbiI6ImFtb2NybS5ydSIsInZlcnNpb24iOjIsInNjb3BlcyI6WyJjcm0iLCJmaWxlcyIsImZpbGVzX2RlbGV0ZSIsIm5vdGlmaWNhdGlvbnMiLCJwdXNoX25vdGlmaWNhdGlvbnMiXSwiaGFzaF91dWlkIjoiYjJkYzk2NTktZDlmNi00OTFhLWJmZGEtYTliZjFkYjA2ZmE2IiwidXNlcl9mbGFncyI6MCwiYXBpX2RvbWFpbiI6ImFwaS1iLmFtb2NybS5ydSJ9.AIZDH2Y67THYbiqKgqTTyg6RoFLp7SoGf0Dp9RprNqS1hHRl-lThgCRhZie4xVjiPJQ1BQnhbYk0fWA6aa1SwkpcvZHGGG07aLNCM1ev12ffchSygtLcgYcZzcF1gXbqbFKWPCLCC1JUV56LkffTzBOlYFOlm3wRGUbsy6GF3hLGwLXPwYm6hLtHpZX694wd5m5Mw9Go-WUSLjIaYvdBKsccGh8smpr8BUoBYO93Ybe-DC1sbZuqsjZiBAVqawMvG8N-zUUubZaT8OtKiaDGjDhCNbstQ1C48uZdNqV7JSZdFAcp2SSLxfttC6wqxC6GYjJc0befISLytkR4H9gV0g";
if (!AMO_TOKEN) {
	console.error("AMO_ACCESS_TOKEN is required");
	process.exit(1);
}

const sendLead = async (payload) => {
	const res = await fetch(`${AMO_BASE_URL}/api/v4/leads/complex`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${AMO_TOKEN}`,
		},
		body: JSON.stringify(payload),
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`amoCRM error ${res.status}: ${text}`);
	}
	return res.json();
};

app.post("/api/amo-lead", async (req, res) => {
	const {
		name,
		phone,
		email,
		city,
		source = "contacts-section",
	} = req.body || {};
	if (!name && !phone && !email)
		return res.status(400).json({ error: "No contact data" });

	const payload = [
		{
			name: `Заявка: ${name || phone || "клиент"}`,
			tags: [
				{ name: "Контактная форма" },
				{ name: "mounir-site" },
				{ name: source },
			],
			_embedded: {
				contacts: [
					{
						first_name: name || "Без имени",
						custom_fields_values: [
							phone
								? {
										field_code: "PHONE",
										values: [{ value: phone, enum_code: "WORK" }],
								  }
								: null,
							email
								? {
										field_code: "EMAIL",
										values: [{ value: email, enum_code: "WORK" }],
								  }
								: null,
						].filter(Boolean),
					},
				],
			},
			custom_fields_values: city
				? [{ field_code: "ADDRESS", values: [{ value: city }] }]
				: undefined,
		},
	];

	try {
		const result = await sendLead(payload);
		res.json(result);
	} catch (e) {
		console.error(e);
		res.status(500).json({ error: "amoCRM failed" });
	}
});

app.post("/api/amo-payment", async (req, res) => {
	const {
		name,
		phone,
		email,
		city,
		ticketType,
		day,
		amount,
		currency,
		transactionId,
		paymentStatus = "success",
	} = req.body || {};

	if (!ticketType || !amount)
		return res.status(400).json({ error: "Missing ticket data" });

	const payload = [
		{
			name: `Оплата ${ticketType}${day ? ` (${day})` : ""} — ${paymentStatus}`,
			price: amount,
			tags: [
				{ name: "Покупка билета" },
				{ name: ticketType },
				{ name: paymentStatus },
				day ? { name: day } : null,
			].filter(Boolean),
			_embedded: {
				contacts: [
					{
						first_name: name || "Покупатель",
						custom_fields_values: [
							phone
								? {
										field_code: "PHONE",
										values: [{ value: phone, enum_code: "WORK" }],
								  }
								: null,
							email
								? {
										field_code: "EMAIL",
										values: [{ value: email, enum_code: "WORK" }],
								  }
								: null,
						].filter(Boolean),
					},
				],
			},
			custom_fields_values: [
				day ? { field_code: "DATE", values: [{ value: day }] } : null,
				city ? { field_code: "ADDRESS", values: [{ value: city }] } : null,
				transactionId
					? { field_code: "TRACKING_ID", values: [{ value: transactionId }] }
					: null,
				currency
					? { field_code: "CURRENCY", values: [{ value: currency }] }
					: null,
			].filter(Boolean),
		},
	];

	try {
		const result = await sendLead(payload);
		res.json(result);
	} catch (e) {
		console.error(e);
		res.status(500).json({ error: "amoCRM failed" });
	}
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API listening on ${PORT}`));
