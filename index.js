const express = require("express");
const res = require("express/lib/response");
var sqlite3 = require("sqlite3").verbose();
var db = new sqlite3.Database("contacts.db");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const multer = require("multer");
const admin = require("firebase-admin");
require("dotenv").config();
console.log("app started");
db.serialize(function () {
  db.run(
    "CREATE TABLE IF NOT EXISTS Users (UserId INTEGER PRIMARY KEY, Email TEXT, Password TEXT)"
  );

  db.run(
    "CREATE TABLE IF NOT EXISTS Contacts(ContactId INTEGER PRIMARY KEY, Name TEXT, Phone INTEGER, Photograph TEXT, UserId, Favourite BOOLEAN NOT NULL CHECK (Favourite IN (0, 1)), FOREIGN KEY(UserId) REFERENCES Users(UserId))"
  );
});

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.PROJECT_ID,
    clientEmail: process.env.CLIENT_EMAIL,
    privateKey: process.env.PRIVATE_KEY,
  }),
  storageBucket: process.env.STORAGE_BUCKET,
});
const bucket = admin.storage().bucket();

const createUser = (email, password, res) => {
  db.serialize(() => {
    db.run(
      `INSERT INTO Users(Email, Password) SELECT "${email}", "${password}" WHERE NOT EXISTS (SELECT * FROM Users WHERE Email="${email}")`,
      [],
      function (err, row) {
        if (err) {
          return res.status(409).send({
            status: 409,
            message: "user already exists",
            data: {},
          });
        }
        const token = jwt.sign(
          { userId: this.lastID, email: email },
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

const createContact = (name, phone, photograph = null, userId, res) => {
  if (photograph) {
    bucket
      .upload(photograph.path, {
        destination: Date.now() + "-" + photograph.filename,
      })
      .then(([_, { mediaLink }]) => {
        db.serialize(() => {
          db.run(
            "INSERT INTO Contacts(Name, Phone, Photograph, UserId, Favourite) VALUES (?, ?, ?, ?, ?)",
            [name, phone, mediaLink, parseInt(userId), 0],
            function (err, row) {
              if (err) {
                return res.status(500).send({
                  status: 500,
                  message: "something went wrong",
                  data: {},
                });
              }
              return res.status(200).send({
                status: 200,
                message: "ok",
                data: {
                  name,
                  phone,
                  photograph: mediaLink,
                  contactId: this.lastID,
                },
              });
            }
          );
        });
      });
  } else {
    db.serialize(() => {
      db.run(
        "INSERT INTO Contacts(Name, Phone, Photograph, UserId, Favourite) VALUES (?, ?, ?, ?, ?)",
        [name, phone, photograph, parseInt(userId), 0],
        function (err, row) {
          if (err) {
            return res.status(500).send({
              status: 500,
              message: "something went wrong",
              data: {},
            });
          }
          return res.status(200).send({
            status: 200,
            message: "ok",
            data: {
              name,
              phone,
              photograph,
              contactId: this.lastID,
            },
          });
        }
      );
    });
  }
};

const deleteContact = (contactId, user, res) => {
  db.serialize(() => {
    db.run(
      `DELETE FROM Contacts WHERE ContactId = ${parseInt(
        contactId
      )} AND UserID = ${parseInt(user)}`,
      function (err, row) {
        if (err) {
          return res.status(500).send({
            status: 500,
            message: "something went wrong",
            data: {},
          });
        }
        return res.status(200).send({
          status: 200,
          message: "ok",
          data: {},
        });
      }
    );
  });
};

const updateContact = (contactId, userId, { name, phone, photograph }, res) => {
  bucket
    .upload(photograph.path, {
      destination: Date.now() + "-" + photograph.filename,
    })
    .then(([first, { mediaLink }]) => {
      db.serialize(() => {
        db.run(
          `UPDATE Contacts SET Name = "${name}", Phone = ${phone}, Photograph = "${mediaLink}" WHERE ContactId = ${contactId} AND UserId = ${userId}`,
          function (err, row) {
            if (err) {
              return res.status(500).send({
                status: 500,
                message: "something went wrong",
                data: { err },
              });
            }
            return res.status(200).send({
              status: 200,
              message: "ok",
              data: {
                name,
                phone,
                photograph: mediaLink,
                contactId,
              },
            });
          }
        );
      });
    });
};

const updateFavourite = (contactId, userId, favourite, res) => {
  db.serialize(() => {
    db.run(
      `UPDATE Contacts SET Favourite = ${favourite} WHERE ContactId = ${contactId} AND UserId = ${userId}`,
      function (err, row) {
        if (err) {
          return res.status(500).send({
            status: 500,
            message: "something went wrong",
            data: { err },
          });
        }
        return res.status(200).send({
          status: 200,
          message: "ok",
          data: {
            contactId,
            favourite,
          },
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
      `SELECT UserId, Email FROM Users WHERE Email="${email}" AND Password="${password}"`,
      [],
      (err, row) => {
        if (row) {
          const token = jwt.sign(
            { userId: row.UserId, email: row.Email },
            "key_secret"
          );
          return res.status(200).send({
            status: 200,
            message: "ok",
            data: { token },
          });
        } else if (err) {
          return res
            .status(500)
            .send({ status: 500, message: "something went wrong", data: {} });
        }

        result = {
          ...handleError({
            status: 401,
            message: "invalid credentials",
          }),
        };
        return res.status(result.status).send(result);
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

const getContacts = (userId) => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.all(
        `SELECT ContactId AS contactId, Name AS name, Phone AS phone, Photograph AS photograph, Favourite as favourite FROM Contacts WHERE UserId = ${parseInt(
          userId
        )}`,
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

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "./images");
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  },
});

const app = express();

app.use(express.json());

app.use(cors());

const upload = multer({ storage: storage });

app.post("/signup", function (req, res) {
  const { email, password } = req.body;

  createUser(email, password, res);
});

app.post("/signin", function (req, res) {
  const { email, password } = req.body;

  auth(email, password, res);
});

app.get("/contacts", verifyToken, function (req, res) {
  getContacts(req.user.userId).then((results) => res.send({ results }));
});

app.post(
  "/contacts",
  verifyToken,
  upload.single("images"),
  function (req, res) {
    const { name, phone } = req.body;
    const photograph = req.file;
    createContact(name, phone, photograph, req.user.userId, res);
  }
);

app.delete("/contacts/:id", verifyToken, (req, res) => {
  const { id } = req.params;

  deleteContact(id, req.user.userId, res);
});

app.put("/contacts/:id", verifyToken, upload.single("images"), (req, res) => {
  const { id } = req.params;
  const photograph = req.file;

  updateContact(id, req.user.userId, { ...req.body, photograph }, res);
});

app.put("/favourites/:id", verifyToken, (req, res) => {
  const { id } = req.params;
  const { favourite } = req.body;

  updateFavourite(id, req.user.userId, favourite, res);
});

app.get("/user", verifyToken, (req, res) => {
  res.send(req.user.email);
});

const server = app.listen(process.env.PORT || 4000);
console.log("server started on port:: ", process.env.PORT || 4000);
