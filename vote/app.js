const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session');
const fs1 = require('fs');
const fs = require('node:fs/promises');
const crypto = require('crypto');
const grpc = require('@grpc/grpc-js');
const { connect, hash, signers } = require('@hyperledger/fabric-gateway');

const { TextDecoder } = require('node:util');

const channelName = envOrDefault('CHANNEL_NAME', 'mychannel');
const chaincodeName = envOrDefault('CHAINCODE_NAME', 'vote');
const mspId = envOrDefault('MSP_ID', 'Org1MSP');

const app = express();
const port = 3000;

// Path to crypto materials.
const cryptoPath = envOrDefault(
    'CRYPTO_PATH',
    path.resolve(
        __dirname,
        '..',
        '..',
        'test-network',
        'organizations',
        'peerOrganizations',
        'org1.example.com'
    )
);

// Path to user private key directory.
const keyDirectoryPath = envOrDefault(
    'KEY_DIRECTORY_PATH',
    path.resolve(
        cryptoPath,
        'users',
        'User1@org1.example.com',
        'msp',
        'keystore'
    )
);

// Path to user certificate directory.
const certDirectoryPath = envOrDefault(
    'CERT_DIRECTORY_PATH',
    path.resolve(
        cryptoPath,
        'users',
        'User1@org1.example.com',
        'msp',
        'signcerts'
    )
);  

// Path to peer tls certificate.
const tlsCertPath = envOrDefault(
    'TLS_CERT_PATH',
    path.resolve(cryptoPath, 'peers', 'peer0.org1.example.com', 'tls', 'ca.crt')
);

// Gateway peer endpoint.
const peerEndpoint = envOrDefault('PEER_ENDPOINT', 'localhost:7051');

// Gateway peer SSL host name override.
const peerHostAlias = envOrDefault('PEER_HOST_ALIAS', 'peer0.org1.example.com');

const utf8Decoder = new TextDecoder();


const validUsername = 'admin';
const validPassword = '123';
let isElectionActive = false; 





async function newGrpcConnection() {
    const tlsRootCert = await fs.readFile(tlsCertPath);
    const tlsCredentials = grpc.credentials.createSsl(tlsRootCert);
    return new grpc.Client(peerEndpoint, tlsCredentials, {
        'grpc.ssl_target_name_override': peerHostAlias,
    });
}

async function newIdentity() {
    const certPath = await getFirstDirFileName(certDirectoryPath);
    const credentials = await fs.readFile(certPath);
    return { mspId, credentials };
}

async function getFirstDirFileName(dirPath) {
    const files = await fs.readdir(dirPath);
    const file = files[0];
    if (!file) {
        throw new Error(`No files in directory: ${dirPath}`);
    }
    return path.join(dirPath, file);
}

async function newSigner() {
    const keyPath = await getFirstDirFileName(keyDirectoryPath);
    const privateKeyPem = await fs.readFile(keyPath);
    const privateKey = crypto.createPrivateKey(privateKeyPem);
    return signers.newPrivateKeySigner(privateKey);
}



app.use(bodyParser.urlencoded({ extended: false }));

app.use(bodyParser.json());

app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: 'your-secret-key',  // Change this to a strong secret in production
    resave: false,              // Prevents session being saved back to the session store unless modified
    saveUninitialized: true,    // Forces a session that is uninitialized to be saved to the store
    cookie: { secure: false }   // Set secure: true if using HTTPS
}));




function computeSHA256(inputString) {
    const hash = crypto.createHash('sha256');
    hash.update(inputString);
    const digest = hash.digest('hex');
    return digest;
}


app.post('/login', function(req, res) {
    var username = req.body.username;
    var password = req.body.password;
    console.log(username,password);
    

    if (username === validUsername && password === validPassword) {
        req.session.isLogged=true;
        req.session.username = username;
        console.log(__dirname);
        res.sendFile(path.join(__dirname+"/public/admin.html"))
    } else {
        res.sendFile(path.join(__dirname+"/public/adminLogin.html"))
    }
});


app.post('/addvoter', (req, res) => {
    var key=computeSHA256(req.body.key);
    const voterData = {
        voterid:'v111',
        name: req.body.name,
        key: key
    };

    const filePath = path.join(__dirname, '/voters.json');
    let voters = [];
    
    if (fs1.existsSync(filePath)) {
        const fileData = fs1.readFileSync(filePath);
        voters = JSON.parse(fileData);
    }
    let t=voters.length;
    voterData.voterid='v'+t;

    voters.push(voterData);

    fs1.writeFileSync(filePath, JSON.stringify(voters, null, 3));

    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Candidate Added</title>
            <script>
                alert('Voter added successfully. Your voter ID:v${t}');
                window.location.href = '/addVoter.html'; // Redirect to the addCandidate page
            </script>
        </head>
        <body>
        </body>
        </html>
        `);
});

app.post('/add-candidate', (req, res) => {
    const newCandidate = {
        candid: `c111`, 
        name: req.body.name,
        age: req.body.age,
        image_str: req.body.image_str,
        party: req.body.party,
        party_img: req.body.party_img,
        voteCount: 0
    };

    const filePath = path.join(__dirname, 'candidates.json');
    let candidates = [];

    if (fs1.existsSync(filePath)) {
        const fileData = fs1.readFileSync(filePath, 'utf-8');
        candidates = JSON.parse(fileData);
    }

    let t=candidates.length;
    newCandidate.candid="c"+t;
    candidates.push(newCandidate);

    
    fs1.writeFileSync(filePath, JSON.stringify(candidates, null, 2));

    
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Candidate Added</title>
            <script>
                alert('Candidate added successfully!');
                window.location.href = '/addCandidate.html'; // Redirect to the addCandidate page
            </script>
        </head>
        <body>
        </body>
        </html>
        `);
});



app.post('/voterLogin', async (req, res) => {
    const voterId = req.body.voterId;
    const password = req.body.password;
    const key = computeSHA256(password);
    
    const filePath = path.join(__dirname, 'voters.json');

    const network = gateway.getNetwork(channelName);
    const contract = network.getContract(chaincodeName);

    if(!isElectionActive)
    {
        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Candidate Added</title>
                <script>
                    alert('Election is not started yet!');
                    window.location.href = '/index.html'; // Redirect to the addCandidate page
                </script>
            </head>
            <body>
            </body>
            </html>
            `);
        return;
    }


    if(voterExists(contract,voterId))
    {
        if (fs1.existsSync(filePath)) {
            const fileData = fs1.readFileSync(filePath);
            const voters = JSON.parse(fileData); 
            
            // Find voter by ID and check password
            const voter = voters.find(v => v.voterid === voterId && v.key === key);
    
            if (voter) {
                const result=await queryVoter(contract,voterId);
                if(!result.hasVoted){
                    req.session.isLogged=true;
                    req.session.voterid = voterId;
                    res.sendFile(path.join(__dirname+"/public/voter.html"))
                }
                else{
                    res.send(`
                        <!DOCTYPE html>
                        <html lang="en">
                        <head>
                            <meta charset="UTF-8">
                            <meta name="viewport" content="width=device-width, initial-scale=1.0">
                            <title>Candidate Added</title>
                            <script>
                                alert('Voter has already voted!');
                                window.location.href = '/index.html'; // Redirect to the addCandidate page
                            </script>
                        </head>
                        <body>
                        </body>
                        </html>
                        `);
                }
            } 
            else {
                res.send(`
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>Candidate Added</title>
                        <script>
                            alert('Invalid Key!');
                            window.location.href = '/index.html'; // Redirect to the addCandidate page
                        </script>
                    </head>
                    <body>
                    </body>
                    </html>
                    `);
            }
        } 
    }
    else {
        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Candidate Added</title>
                <script>
                    alert('Invalid Voter ID!');
                    window.location.href = '/index.html'; // Redirect to the addCandidate page
                </script>
            </head>
            <body>
            </body>
            </html>
            `);
    }

    
});


app.post('/vote', async (req, res) => {
    const { candidateId } = req.body;
    const voterId=req.session.voterid;
    console.log("hello");
    console.log(candidateId);
    const network = gateway.getNetwork(channelName);
    const contract = network.getContract(chaincodeName);

    const result=await voteForCandidate(contract,voterId,candidateId);

    const filePath2 = path.join(__dirname, '/candidates.json');
    let candidates = [];

    let can;

    if (fs1.existsSync(filePath2)) {
        const fileData = fs1.readFileSync(filePath2);
        candidates = JSON.parse(fileData);
    }

    for(let i=0;i<candidates.length;i++){
        if(candidates[i].candid==candidateId){
            can=candidates[i].name;
            break;
        }
    }

    // Send the response first, then destroy the session
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Candidate Added</title>
            <script>
                alert('Voted Successfully for ${can}!');
                window.location.href = '/index.html'; 
            </script>
        </head>
        <body>
        </body>
        </html>
    `);

    // Now destroy the session after the response has been sent
    req.session.destroy(function(err) {
        if (err) {
            console.log('Error destroying session:', err);
        } else {
            console.log('Session destroyed successfully');
        }
    });

});


app.get('/get-election-state', (req, res) => {
    res.json({ electionActive: isElectionActive });
});

app.post('/toggle-election', async (req, res) => {
    isElectionActive = !isElectionActive;
    if(isElectionActive){
        const filePath = path.join(__dirname, '/voters.json');
        let voters = [];
        
        if (fs1.existsSync(filePath)) {
            const fileData = fs1.readFileSync(filePath);
            voters = JSON.parse(fileData);
        }
        const filePath2 = path.join(__dirname, '/candidates.json');
        let candidates = [];
        
        if (fs1.existsSync(filePath2)) {
            const fileData = fs1.readFileSync(filePath2);
            candidates = JSON.parse(fileData);
        }

        if(candidates.length==0 || voters.length==0)
        {
            isElectionActive = !isElectionActive;
            
            res.send(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Candidate Added</title>
                    <script>
                        alert('No Candidates or Voters!');
                        window.location.href = '/admin.html'; 
                    </script>
                </head>
                <body>
                </body>
                </html>
            `);

            return;
        }
         
        try {        
            const network = gateway.getNetwork(channelName);
            const contract = network.getContract(chaincodeName);
    
            for (let i = 0; i < voters.length; i++) {
                await addVoter(contract, voters[i].voterid);
                console.log(`Voter Name: ${voters[i].name}, Voter ID: ${voters[i].voterid}`);
            }

            for(let i=0;i<candidates.length;i++){
                await addCandidate(contract, candidates[i].candid);
                console.log(`Candidate Name: ${candidates[i].name}, Cand ID ${candidates[i].candid}`);
            }
    
        } catch (error) {
            console.error('Error occurred:', error);
        } 
        
    }
    await res.json({ electionActive: isElectionActive });
});

app.get('/viewResults', async (req,res)=>{
    const filePath2 = path.join(__dirname, '/candidates.json');
    let candidates = [];
    
    if (fs1.existsSync(filePath2)) {
        const fileData = fs1.readFileSync(filePath2);
        candidates = JSON.parse(fileData);
    }
    const network = gateway.getNetwork(channelName);
    const contract = network.getContract(chaincodeName);
    
    for(let i=0;i<candidates.length;i++){
        const result=await queryCandidate(contract, candidates[i].candid);
        console.log(`Candidate Name: ${candidates[i].name},Votes: ${result.voteCount}`);
        candidates[i].voteCount=result.voteCount;
    }

    fs1.writeFileSync(filePath2, JSON.stringify(candidates, null, 2));

    res.sendFile(path.join(__dirname + "/public/results.html"));

});



app.post('/logout', function(req, res) {
    req.session.destroy(function(err) {
        if (err) {
            console.log('Error destroying session:', err);
            return res.status(500).send('Error logging out.');
        }
        res.sendFile(path.join(__dirname + "/public/index.html"));
    });
});


app.get('/api/candidates', (req, res) => {
    const filePath = path.join(__dirname, 'candidates.json');
    const data = fs1.readFileSync(filePath, 'utf-8');
    const candidates = JSON.parse(data);
    res.json(candidates);
});

function envOrDefault(key, defaultValue) {
    return process.env[key] || defaultValue;
}



// Home route to serve the HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
let client;
let gateway;

async function main() {
    client = await newGrpcConnection();
        
    gateway = await connect({
        client,
        identity: await newIdentity(),
        signer: await newSigner(),
        hash: hash.sha256,
        evaluateOptions: () => {
            return { deadline: Date.now() + 5000 }; // 5 seconds
        },
        endorseOptions: () => {
            return { deadline: Date.now() + 15000 }; // 15 seconds
        },
        submitOptions: () => {
            return { deadline: Date.now() + 5000 }; // 5 seconds
        },
        commitStatusOptions: () => {
            return { deadline: Date.now() + 60000 }; // 1 minute
        },
    });
}


main();

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});


async function  (contract,voterid) {
    console.log(`\n--> Add Voter ${voterid}`);
    try{
        const resultBytes = await contract.submitTransaction('addVoter',voterid);
        const result=utf8Decoder.decode(resultBytes);
        console.log('\n*** Result:',result);
    }
    catch(error)
    {
        console.log('\n*** Successfully caught the error: ', error);
    }
}

async function addCandidate(contract,candid) 
{
    console.log(`\n--> Add Candidate: ${candid}`);
    try{
        const resultBytes = await contract.submitTransaction('addCandidate',candid);
        const result=utf8Decoder.decode(resultBytes);
        console.log('\n*** Result:',result);
    }
    catch(error)
    {
        console.log('\n*** Successfully caught the error: ', error);
    }
}


async function voterExists(contract,voterid) {
    console.log(`\n--> Voter Exists: ${voterid}`);
    const resultBytes = await contract.evaluateTransaction('voterExists',voterid);
    const result=utf8Decoder.decode(resultBytes);
    console.log('\n*** Result:',result);
    return result;
}

async function queryVoter(contract,voterid) {
    console.log(`\n--> Query Voter: ${voterid}`);
    try{
    const resultBytes = await contract.evaluateTransaction('queryVoter',voterid);
    const resultJson = utf8Decoder.decode(resultBytes);
    const result = JSON.parse(resultJson);
    console.log('\n*** Result:',result);
    return result;
    }
    catch(error)
    {
        console.log('\n*** Successfully caught the error: ', error);

    }
}


async function voteForCandidate(contract,voterid,candid) {
    try{
        console.log(`\n--> Vote for Candidate: ${voterid} to ${candid}`);
        const resultBytes = await contract.submitTransaction('voteForCandidate',voterid,candid);
        const result=utf8Decoder.decode(resultBytes);
        console.log('\n*** Result:',result);
        return result;
    }
    catch(error)
    {
        console.log('\n*** Successfully caught the error: ', error);
    }
}

async function queryCandidate(contract,candid) {
    console.log(`\n--> Query Candidate: ${candid}`);
    try{
    const resultBytes = await contract.evaluateTransaction('queryCandidate',candid);
    const resultJson = utf8Decoder.decode(resultBytes);
    const result = JSON.parse(resultJson);
    console.log('\n*** Result:',result);
    return result;
    }
    catch(error)
    {
        console.log('\n*** Successfully caught the error: ', error);

    }
}