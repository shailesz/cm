const express = require("express");
var sqlite3 = require("sqlite3").verbose();
var db = new sqlite3.Database(":memory:");
const jwt = require("jsonwebtoken");

db.serialize(function () {
	db.run("CREATE TABLE users (email TEXT, password TEXT)");

	db.run("INSERT INTO users(email, password) VALUES (?, ?)", [
		"gmail@gmail.com",
		"password0",
	]);

	db.each(
		"SELECT rowid AS id, email, password FROM users",
		function (err, row) {
			console.log(
				row.id + ": " + row.email + " " + row.password
			);
		}
	);
});

const createUser = (email, password) => {
	db.serialize(() => {
		db.run("INSERT INTO users(email, password) VALUES (?, ?)", [
			email,
			password,
		]);
	});
};

const listUsers = () => {
	db.serialize(() => {
		db.each(
			"SELECT rowid AS id, email, password FROM users",
			(err, row) => {
				console.log(
					row.id +
						":" +
						row.email +
						" " +
						row.password
				);
			}
		);
	});
};

const findUser = (email) => {
	db.serialize(() => {
		db.get(
			`SELECT email, password FROM users WHERE email = ?`,
			[email],
			(err, row) => {
				if (err) {
					console.log(err);
				}

				if (row) {
					console.log(row);
				} else {
					console.log("not found");
				}
			}
		);
	});
};

const app = express();

app.use(express.json());

app.get("/", function requestHandler(req, res) {
	listUsers();
	res.send("Hello, World!");
});

app.post("/signup", function (req, res) {
	const { email, password } = req.body;
	jwt.sign({ data: { email, password } }, "key_secret", (err, token) => {
		if (err) {
			res.status(400).send({ msg: "Error" });
		} else {
			jwt.verify(token, "key_secret", (err, decoded) => {
				if (err) {
					res.status(400).send({ msg: "Error" });
				} else {
					createUser(email, password);
					res.send({
						msg: "success",
						token,
						decoded,
					});
				}
			});
		}
	});
});

app.post("/signin", function (req, res) {
	const { email, password } = req.body;
	findUser(email);
	res.send(req.body);
});

const server = app.listen(3000);
