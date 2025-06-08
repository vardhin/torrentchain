// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract IPNSRegistry {
    struct IPNSRecord {
        string ipnsName;
        uint256 timestamp;
        bool exists;
    }

    // Mapping from identifier to IPNS record
    mapping(string => IPNSRecord) private records;
    
    // Array to keep track of all identifiers
    string[] private identifiers;

    // Events
    event RecordAdded(string identifier, string ipnsName);
    event RecordUpdated(string identifier, string ipnsName);

    // Add or update a record
    function addRecord(string memory identifier, string memory ipnsName) public {
        require(bytes(identifier).length > 0, "Identifier cannot be empty");
        require(bytes(ipnsName).length > 0, "IPNS name cannot be empty");

        if (!records[identifier].exists) {
            // New record
            identifiers.push(identifier);
            records[identifier] = IPNSRecord(ipnsName, block.timestamp, true);
            emit RecordAdded(identifier, ipnsName);
        } else {
            // Update existing record
            records[identifier].ipnsName = ipnsName;
            records[identifier].timestamp = block.timestamp;
            emit RecordUpdated(identifier, ipnsName);
        }
    }

    // Get IPNS name by identifier
    function getRecord(string memory identifier) public view returns (string memory ipnsName, uint256 timestamp, bool exists) {
        IPNSRecord memory record = records[identifier];
        return (record.ipnsName, record.timestamp, record.exists);
    }

    // Get all identifiers
    function getAllIdentifiers() public view returns (string[] memory) {
        return identifiers;
    }

    // Get total number of records
    function getRecordCount() public view returns (uint256) {
        return identifiers.length;
    }
} 