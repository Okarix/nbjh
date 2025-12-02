import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
app.use(cors());
app.use(express.json());

const AMO_BASE_URL = "https://mounirmasterclass.amocrm.ru";
const AMO_ACCESS_TOKEN =
	"eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6ImQ4MzM0NWEyY2Q0ZjllN2NkYTJlYWYxMmJkMTRjMzUxODdlOTA2NGJmYWEzMDYxNWIxYWY4NTlkMTA5MzI3ZTM2YzM0YTA3NmNhMTM3YjRhIn0.eyJhdWQiOiJjOWQyOThjZS0wNzY5LTQ1ZDgtODRhNy1mZmQ1YzBjZmI0NTgiLCJqdGkiOiJkODMzNDVhMmNkNGY5ZTdjZGEyZWFmMTJiZDE0YzM1MTg3ZTkwNjRiZmFhMzA2MTViMWFmODU5ZDEwOTMyN2UzNmMzNGEwNzZjYTEzN2I0YSIsImlhdCI6MTc2NDY5NDgwNCwibmJmIjoxNzY0Njk0ODA0LCJleHAiOjE3OTM0MDQ4MDAsInN1YiI6IjEzMjQxMTUwIiwiZ3JhbnRfdHlwZSI6IiIsImFjY291bnRfaWQiOjMyNzc3MDk4LCJiYXNlX2RvbWFpbiI6ImFtb2NybS5ydSIsInZlcnNpb24iOjIsInNjb3BlcyI6WyJjcm0iLCJmaWxlcyIsImZpbGVzX2RlbGV0ZSIsIm5vdGlmaWNhdGlvbnMiLCJwdXNoX25vdGlmaWNhdGlvbnMiXSwiaGFzaF91dWlkIjoiYjJkYzk2NTktZDlmNi00OTFhLWJmZGEtYTliZjFkYjA2ZmE2IiwidXNlcl9mbGFncyI6MCwiYXBpX2RvbWFpbiI6ImFwaS1iLmFtb2NybS5ydSJ9.AIZDH2Y67THYbiqKgqTTyg6RoFLp7SoGf0Dp9RprNqS1hHRl-lThgCRhZie4xVjiPJQ1BQnhbYk0fWA6aa1SwkpcvZHGGG07aLNCM1ev12ffchSygtLcgYcZzcF1gXbqbFKWPCLCC1JUV56LkffTzBOlYFOlm3wRGUbsy6GF3hLGwLXPwYm6hLtHpZX694wd5m5Mw9Go-WUSLjIaYvdBKsccGh8smpr8BUoBYO93Ybe-DC1sbZuqsjZiBAVqawMvG8N-zUUubZaT8OtKiaDGjDhCNbstQ1C48uZdNqV7JSZdFAcp2SSLxfttC6wqxC6GYjJc0befISLytkR4H9gV0g";
const AMO_PIPELINE_ID = undefined; // set your pipeline id if needed
const AMO_STATUS_ID = undefined; // set your status id if needed
const AMO_DEFAULT_TAGS = []; // add default tag strings if needed

if (!AMO_ACCESS_TOKEN) {
	console.error("AMO_ACCESS_TOKEN is not configured");
	process.exit(1);
}

const normalizeUrl = (base, path) =>
	base.endsWith("/") ? `${base.slice(0, -1)}${path}` : `${base}${path}`;

const amoRequest = async (path, init) => {
	const url = normalizeUrl(AMO_BASE_URL, path);
	const headers = {
		"Content-Type": "application/json",
		Authorization: `Bearer ${AMO_ACCESS_TOKEN}`,
		...(init?.headers || {}),
	};

	const response = await fetch(url, { ...init, headers });
	if (!response.ok) {
		const text = await response.text();
		const detail = text || response.statusText;
		const error = new Error(`amoCRM request failed: ${detail}`);
		error.status = response.status;
		error.detail = detail;
		throw error;
	}

	const contentType = response.headers.get("content-type") || "";
	if (contentType.includes("application/json")) return response.json();
	return response.text();
};

const buildContact = (contact) => {
	const customFields = [];

	if (contact.phone) {
		customFields.push({
			field_code: "PHONE",
			values: [{ value: contact.phone, enum_code: "WORK" }],
		});
	}

	if (contact.email) {
		customFields.push({
			field_code: "EMAIL",
			values: [{ value: contact.email, enum_code: "WORK" }],
		});
	}

	return {
		first_name: contact.name || "Клиент",
		custom_fields_values: customFields.length ? customFields : undefined,
	};
};

const createLeadWithContact = async ({
	leadName,
	price,
	tags,
	contact,
	note,
}) => {
	const payload = [
		{
			name: leadName,
			price,
			pipeline_id: AMO_PIPELINE_ID,
			status_id: AMO_STATUS_ID,
			tags: [...AMO_DEFAULT_TAGS, ...(tags || [])].map((name) => ({ name })),
			_embedded: {
				contacts: [buildContact(contact)],
			},
		},
	];

	const leadResponse = await amoRequest("/api/v4/leads/complex", {
		method: "POST",
		body: JSON.stringify(payload),
	});

	const createdLead =
		leadResponse?._embedded?.leads?.[0] || (Array.isArray(leadResponse) ? leadResponse[0] : null);
	const leadId = createdLead?.id;
	const createdContact =
		createdLead?._embedded?.contacts?.[0] ||
		(createdLead?._embedded?.contacts?.length
			? createdLead._embedded.contacts[0]
			: undefined);
	const contactId = createdContact?.id;

	if (note && leadId) {
		await amoRequest("/api/v4/leads/notes", {
			method: "POST",
			body: JSON.stringify([
				{
					entity_id: leadId,
					note_type: "common",
					params: { text: note },
				},
			]),
		});
	}

	return { leadId, contactId, raw: leadResponse };
};

app.post("/api/amo-lead", async (req, res) => {
	try {
		const { name, phone, email, city, source, message } = req.body || {};

		if (!name && !phone && !email) {
			return res
				.status(400)
				.json({ error: "Missing lead data: name, phone or email required" });
		}

		const noteLines = [
			"Источник: форма контактов на сайте",
			source ? `Точка входа: ${source}` : null,
			name ? `Имя: ${name}` : null,
			phone ? `Телефон: ${phone}` : null,
			email ? `Email: ${email}` : null,
			city ? `Город: ${city}` : null,
			message ? `Комментарий: ${message}` : null,
		].filter(Boolean);

		const result = await createLeadWithContact({
			leadName: `Заявка с контактов: ${name || phone || "клиент"}`,
			tags: ["Контактная форма", "mounir-site"],
			contact: {
				name: name || "Без имени",
				phone,
				email,
				city,
			},
			note: noteLines.join("\n"),
		});

		return res.json({ success: true, ...result });
	} catch (error) {
		console.error("AmoCRM lead error:", error);
		return res.status(error.status || 500).json({
			error: error.detail || error.message || "Failed to create lead",
		});
	}
});

app.post("/api/amo-payment", async (req, res) => {
	try {
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
			paymentStatus,
		} = req.body || {};

		if (!ticketType || !amount) {
			return res.status(400).json({ error: "Missing payment lead data" });
		}

		const status = paymentStatus || "success";
		const leadName = `Оплата билета ${ticketType}${day ? ` (${day})` : ""}`;

		const noteLines = [
			"Источник: оплата билета через сайт",
			ticketType ? `Тип билета: ${ticketType}` : null,
			day ? `День: ${day}` : null,
			amount
				? `Сумма: ${amount}${currency ? ` ${currency}` : ""}`
				: null,
			status ? `Статус оплаты: ${status}` : null,
			transactionId ? `ID транзакции: ${transactionId}` : null,
			name ? `Покупатель: ${name}` : null,
			phone ? `Телефон: ${phone}` : null,
			email ? `Email: ${email}` : null,
			city ? `Город: ${city}` : null,
		].filter(Boolean);

		const result = await createLeadWithContact({
			leadName: `${leadName} — ${status}`,
			price: amount,
			tags: ["Покупка билета", ticketType, status, day].filter(Boolean),
			contact: {
				name: name || "Покупатель",
				phone,
				email,
				city,
			},
			note: noteLines.join("\n"),
		});

		return res.json({ success: true, ...result });
	} catch (error) {
		console.error("AmoCRM payment error:", error);
		return res.status(error.status || 500).json({
			error: error.detail || error.message || "Failed to create payment lead",
		});
	}
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API listening on ${PORT}`));
