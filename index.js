const express = require('express')
const app = express()
const cors = require('cors')
require('dotenv').config()
const jwt = require('jsonwebtoken');
const port = process.env.PORT || 5000
const { MongoClient, ServerApiVersion } = require('mongodb');

app.use(cors())
app.use(express.json())

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.s0nbo.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: "Unauthorized access" })
    }
    const token = authHeader.split(" ")[1]
    jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: "access forbidden" })
        }
        req.decoded = decoded;
        next()
    });

}

async function run() {
    try {
        await client.connect();
        const serviceCollection = client.db('doctorsPortal').collection("services");
        const bookingCollection = client.db('doctorsPortal').collection('bookings')
        const usersCollection = client.db('doctorsPortal').collection('users')

        // make a user ADMIN (3)
        app.put('/user/admin/:email', verifyJWT, async (req, res) => {
            const requester = req.decoded.email;
            const requesterInfo = await usersCollection.findOne({ email: requester });
            const isAdmin = requesterInfo?.role === "admin"
            if (isAdmin) {
                const email = req.params.email;
                const filter = { email: email };
                const updateDoc = {
                    $set: { role: "admin" },
                };
                const result = await usersCollection.updateOne(filter, updateDoc);
                return res.send(result)
            }
            else {
                return res.send({ message: "failed" })
            }
        })

        //check current user is admin or not TRUE || FALSE (4)
        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const userInfo = await usersCollection.findOne({ email: email });
            const isAdmin = userInfo?.role === "admin"
            if (isAdmin) {
                return res.send({ admin: isAdmin })
            }
            else {
                return res.send({ admin: isAdmin })
            }
        })

        // create/update user info  (1)
        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await usersCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN);
            res.send({ success: true, result: result, token: token })
        })

        //get all users (2)
        app.get('/users', verifyJWT, async (req, res) => {
            const result = await usersCollection.find().toArray()
            res.send(result)
        })





        //get all services ***
        app.get('/services', async (req, res) => {
            const query = {};
            const cursor = serviceCollection.find(query);
            const result = await cursor.toArray();
            res.send(result)
        })

        // post all bookings ***
        app.post('/bookings', async (req, res) => {
            const booking = req.body;
            const query = { treatment: booking.treatment, patient: booking.patient, date: booking.date, slot: booking.slot }
            const exists = await bookingCollection.findOne(query)
            if (exists) {
                return res.send({ success: false, data: exists })
            }
            const result = await bookingCollection.insertOne(booking);
            res.send({ success: true, data: result })

        })

        // get specific user's bookings ***
        app.get('/bookings', verifyJWT, async (req, res) => {
            {
                const email = req.query.email;
                const decodedEmail = req?.decoded?.email
                console.log(email, decodedEmail)
                if (decodedEmail === email) {
                    const query = { patient: email }
                    const result = await bookingCollection.find(query).toArray()
                    return res.send(result)
                }
                else {
                    return res.status(403).send({ message: "access forbidden" })
                }

            }
        })

        //for query this is not proper way, use aggregate
        app.get('/available', async (req, res) => {
            const date = req.query.date
            const query = { date: date };
            //step1: get all services [{}, {}, {}, {},{},{}]
            const services = await serviceCollection.find().toArray()

            //step2: get all bookings [{},{}]
            const bookings = await bookingCollection.find(query).toArray()

            //step3: map on services and catch every service
            services.forEach(service => {
                // step 4: take (matchings) services VS bookings [{}, {}]
                const bookingServices = bookings.filter(book => book.treatment === service.name)

                //step 5: select slots for the service bookings 
                const bookedSlots = bookingServices.map(s => s.slot)


                //step6: select those slots that are not in bookedslots
                const available = service.slots.filter(slot => !bookedSlots.includes(slot))
                service.slots = available;
            })
            res.send(services)
        })

    } finally {
        //   await client.close();
    }
}
run().catch(console.dir);



app.get('/', (req, res) => {
    res.send('Hello World!')
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})