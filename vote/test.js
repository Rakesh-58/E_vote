/*
 * Copyright IBM Corp. All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

const grpc = require('@grpc/grpc-js');
const { connect, hash, signers } = require('@hyperledger/fabric-gateway');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { TextDecoder } = require('node:util');

const channelName = envOrDefault('CHANNEL_NAME', 'mychannel');
const chaincodeName = envOrDefault('CHAINCODE_NAME', 'vote');
const mspId = envOrDefault('MSP_ID', 'Org1MSP');

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


async function main() {
    displayInputParameters();

    // The gRPC client connection should be shared by all Gateway connections to this endpoint.
    const client = await newGrpcConnection();

    const gateway = connect({
        client,
        identity: await newIdentity(),
        signer: await newSigner(),
        
        hash: hash.sha256,
        // Default timeouts for different gRPC calls
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

    try {
        
        const network = gateway.getNetwork(channelName);

        const contract = network.getContract(chaincodeName);

        await initLedger(contract);

        await addVoter(contract);

        await addCandidate(contract);

        await voterExists(contract);

        await candidateExists(contract);

        await voteForCandidate(contract);

        await queryVoter(contract);

        await queryCandidate(contract);
    } finally {
        gateway.close();
        client.close();
    }
}

main().catch((error) => {
    console.error('******** FAILED to run the application:', error);
    process.exitCode = 1;
});

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

/**
 * This type of transaction would typically only be run once by an application the first time it was started after its
 * initial deployment. A new version of the chaincode deployed later would likely not need to run an "init" function.
 */
async function initLedger(contract) {
    console.log(
        '\n--> Submit Transaction: InitLedger, function creates the initial set of assets on the ledger'
    );

    await contract.submitTransaction('InitLedger');

    console.log('\n*** Transaction committed successfully');
}

async function addVoter(contract) {
    console.log("\n--> Add Voter: v0");
    try{
        const resultBytes = await contract.submitTransaction('addVoter',"v0");
        const result=utf8Decoder.decode(resultBytes);
        console.log('\n*** Result:',result);
    }
    catch(error)
    {
        console.log('\n*** Successfully caught the error: ', error);
    }
}

async function addCandidate(contract) 
{
    console.log("\n--> Add Candidate: c0");
    try{
        const resultBytes = await contract.submitTransaction('addCandidate',"c0");
        const result=utf8Decoder.decode(resultBytes);
        console.log('\n*** Result:',result);
    }
    catch(error)
    {
        console.log('\n*** Successfully caught the error: ', error);
    }
}

async function voterExists(contract) {
    console.log("\n--> Voter Exists: v0");
    const resultBytes = await contract.evaluateTransaction('voterExists',"v0");
    const result=utf8Decoder.decode(resultBytes);
    console.log('\n*** Result:',result);
}

async function candidateExists(contract) {
    console.log("\n--> Candidate Exists: c0");
    const resultBytes = await contract.evaluateTransaction('candidateExists',"c0");
    const result=utf8Decoder.decode(resultBytes);
    console.log('\n*** Result:',result);
}

async function voteForCandidate(contract) {
    try{
        console.log("\n--> Vote for Candidate: v0 to c0");
    const resultBytes = await contract.submitTransaction('voteForCandidate',"v0","c0");
    const result=utf8Decoder.decode(resultBytes);
    console.log('\n*** Result:',result);
    }
    catch(error)
    {
        console.log('\n*** Successfully caught the error: ', error);
    }
}

async function queryVoter(contract) {
    console.log("\n--> Query Voter: v0");
    try{
    const resultBytes = await contract.evaluateTransaction('queryVoter',"v0");
    const resultJson = utf8Decoder.decode(resultBytes);
    const result = JSON.parse(resultJson);
    console.log('\n*** Result:',result);
    }
    catch(error)
    {
        console.log('\n*** Successfully caught the error: ', error);

    }
}

async function queryCandidate(contract) {
    console.log("\n--> Query Candidate: c0");
    try{
    const resultBytes = await contract.evaluateTransaction('queryCandidate',"c0");
    const resultJson = utf8Decoder.decode(resultBytes);
    const result = JSON.parse(resultJson);
    console.log('\n*** Result:',result);
    }
    catch(error)
    {
        console.log('\n*** Successfully caught the error: ', error);

    }
}



/**
 * envOrDefault() will return the value of an environment variable, or a default value if the variable is undefined.
 */
function envOrDefault(key, defaultValue) {
    return process.env[key] || defaultValue;
}

/**
 * displayInputParameters() will print the global scope parameters used by the main driver routine.
 */
function displayInputParameters() {
    console.log(`channelName:       ${channelName}`);
    console.log(`chaincodeName:     ${chaincodeName}`);
    console.log(`mspId:             ${mspId}`);
    console.log(`cryptoPath:        ${cryptoPath}`);
    console.log(`keyDirectoryPath:  ${keyDirectoryPath}`);
    console.log(`certDirectoryPath: ${certDirectoryPath}`);
    console.log(`tlsCertPath:       ${tlsCertPath}`);
    console.log(`peerEndpoint:      ${peerEndpoint}`);
    console.log(`peerHostAlias:     ${peerHostAlias}`);
}
