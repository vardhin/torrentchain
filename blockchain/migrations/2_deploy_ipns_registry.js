const IPNSRegistry = artifacts.require("IPNSRegistry");

module.exports = function(deployer) {
  deployer.deploy(IPNSRegistry);
}; 