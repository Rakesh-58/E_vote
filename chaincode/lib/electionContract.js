'use strict';

const { Contract } = require('fabric-contract-api');

class ElectionContract extends Contract {

    async InitLedger(ctx) {
        console.log("ledger init");
    }

    // Add a new voter
    async addVoter(ctx, voterID) {
        const exists = await this.voterExists(ctx, voterID);
        if (exists) {
            throw new Error(`The voter ${voterID} already exists`);
        }

        // Create a voter object with hasVoted initially set to false
        const voter = {
            hasVoted: false,
        };

        // Store the voter information on the ledger
        await ctx.stub.putState(voterID, Buffer.from(JSON.stringify(voter)));
        return `Voter ${voterID} has been added`;
    }

    // Add a new candidate
    async addCandidate(ctx, candidateID) {
        const exists = await this.candidateExists(ctx, candidateID);
        if (exists) {
            throw new Error(`The candidate ${candidateID} already exists`);
        }

        // Create a candidate object with voteCount initially set to 0
        const candidate = {
            voteCount: 0,
        };

        // Store the candidate information on the ledger
        await ctx.stub.putState(candidateID, Buffer.from(JSON.stringify(candidate)));
        return `Candidate ${candidateID} has been added`;
    }

    // Check if a voter exists
    async voterExists(ctx, voterID) {
        const voterData = await ctx.stub.getState(voterID);
        return voterData && voterData.length > 0;
    }

    // Check if a candidate exists
    async candidateExists(ctx, candidateID) {
        const candidateData = await ctx.stub.getState(candidateID);
        return candidateData && candidateData.length > 0;
    }

    // Vote for a candidate
    async voteForCandidate(ctx, voterID, candidateID) {
        // Check if the voter exists
        const voterData = await ctx.stub.getState(voterID);
        if (!voterData || voterData.length === 0) {
            throw new Error(`Voter ${voterID} does not exist`);
        }

        const voter = JSON.parse(voterData.toString());

        // Check if the voter has already voted
        if (voter.hasVoted) {
            throw new Error(`Voter ${voterID} has already voted`);
        }

        // Check if the candidate exists
        const candidateData = await ctx.stub.getState(candidateID);
        if (!candidateData || candidateData.length === 0) {
            throw new Error(`Candidate ${candidateID} does not exist`);
        }

        const candidate = JSON.parse(candidateData.toString());

        // Increment the vote count for the candidate
        candidate.voteCount += 1;

        // Update the candidate's vote count on the ledger
        await ctx.stub.putState(candidateID, Buffer.from(JSON.stringify(candidate)));

        // Mark the voter as having voted
        voter.hasVoted = true;
        await ctx.stub.putState(voterID, Buffer.from(JSON.stringify(voter)));

        return `Voter ${voterID} has successfully voted for candidate ${candidateID}`;
    }

    // Query a voter's status (whether they have voted)
    async queryVoter(ctx, voterID) {
        const voterData = await ctx.stub.getState(voterID);
        if (!voterData || voterData.length === 0) {
            throw new Error(`Voter ${voterID} does not exist`);
        }
        return voterData.toString();
    }

    // Query a candidate's vote count
    async queryCandidate(ctx, candidateID) {
        const candidateData = await ctx.stub.getState(candidateID);
        if (!candidateData || candidateData.length === 0) {
            throw new Error(`Candidate ${candidateID} does not exist`);
        }
        return candidateData.toString();
    }
}

module.exports = ElectionContract;
