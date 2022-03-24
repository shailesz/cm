const express = require("express");
const res = require("express/lib/response");
var sqlite3 = require("sqlite3").verbose();
var db = new sqlite3.Database(":memory:");
const jwt = require("jsonwebtoken");

db.serialize(function () {
	db.run(
		"CREATE TABLE Users (UserId INTEGER PRIMARY KEY, Email TEXT, Password TEXT)"
	);

	db.run(
		"CREATE TABLE Tokens(TokenId INTEGER PRIMARY KEY, UserId, Token, FOREIGN KEY(UserId) REFERENCES Users(UserId))"
	);

	db.run(
		"CREATE TABLE Contacts(ContactId INTEGER PRIMARY KEY, Name TEXT, Phone INTEGER, Photograph TEXT)"
	);

	db.run(
		"INSERT INTO Contacts(Name, Phone, Photograph) VALUES (?, ?, ?)",
		["SAILESH", 1231231231, "photola"]
	);

	db.run("INSERT INTO Users(Email, Password) VALUES (?, ?)", [
		"gmail@gmail.com",
		"password0",
	]);

	db.each(
		"SELECT rowid AS UserId, Email, Password FROM Users",
		function (err, row) {
			console.log(
				row.UserId +
					": " +
					row.Email +
					" " +
					row.Password
			);
		}
	);
});

const createUser = (email, password, res) => {
	db.serialize(() => {
		db.run(
			"INSERT INTO Users(Email, Password) VALUES (?, ?)",
			[email, password],
			function (err, row) {
				if (err) {
					return res.status(500).send({
						status: 500,
						message: "something went wrong",
						data: {},
					});
				}
				const token = jwt.sign(
					this.lastID,
					"key_secret"
				);

				return res.status(200).send({
					status: 200,
					message: "ok",
					data: { token },
				});
			}
		);
	});
};

const createContact = (name, phone, photograph, res) => {
	db.serialize(() => {
		db.run(
			"INSERT INTO Contacts(Name, Phone, Photograph) VALUES (?, ?, ?)",
			[name, phone, photograph],
			function (err, row) {
				if (err) {
					res.status(500).send({
						status: 500,
						message: "something went wrong",
						data: {},
					});
				}
				res.status(200).send({
					status: 200,
					message: "ok",
					data: {},
				});
			}
		);
	});
};

const handleError = (err) => {
	return {
		status: err.status || 500,
		message: err.message || "something went wrong",
		data: "",
	};
};

const auth = (email, password, res) => {
	db.serialize(() => {
		db.get(
			`SELECT UserId, Email, Password FROM Users WHERE Email = ? AND Password = ?`,
			[email, password],
			(err, { UserId }) => {
				if (err) {
					const result = { ...handleError(err) };
					return res
						.status(result.status)
						.send(...result);
				}

				if (UserId) {
					const token = jwt.sign(
						UserId,
						"key_secret"
					);
					return res.status(200).send({
						status: 200,
						message: "ok",
						data: { token },
					});
				} else {
					result = {
						...handleError({
							status: 401,
							message: "authentication error",
							data: "",
						}),
					};
					return res
						.status(result.status)
						.send(...result);
				}
			}
		);
	});
};

const verifyToken = (req, res, next) => {
	const authHeader = req.headers["authorization"];
	const token = authHeader && authHeader.split(" ")[1];
	if (token == null) return res.sendStatus(403);
	jwt.verify(token, "key_secret", (err, user) => {
		if (err) return res.sendStatus(404);
		req.user = user;
		next();
	});
};

const getContacts = () => {
	return new Promise((resolve, reject) => {
		db.serialize(() => {
			db.all(
				"SELECT Name, Phone, Photograph FROM Contacts",
				[],
				(err, rows) => {
					if (err) {
						reject(err);
					}
					resolve(rows);
				}
			);
		});
	});
};

const app = express();

app.use(express.json());

app.get("/", function requestHandler(req, res) {
	res.send("Hello, World!");
});

app.post("/signup", function (req, res) {
	const { email, password } = req.body;

	createUser(email, password, res);
});

app.post("/signin", function (req, res) {
	const { email, password } = req.body;
	auth(email, password, res);
});

app.get("/contacts", function (req, res) {
	let allContacts = getContacts().then((results) =>
		res.send({ results })
	);
});

app.post("/contacts", function (req, res) {
	const { name, phone, photograph } = req.body;
	createContact(name, phone, photograph, res);
});

const server = app.listen(3000);
