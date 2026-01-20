// SPDX-License-Identifier: MIT
pragma solidity =0.8.26;

import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title VARProxy
 * @dev Proxy specifically for VAR contract deployments
 */
contract VARProxy is ERC1967Proxy {
    constructor(address implementation, bytes memory data) ERC1967Proxy(implementation, data) {
        // Custom initialization logic can go here if needed
    }

    /**
     * @dev The proxy can receive Ether to facilitate certain operations if necessary.
     */
    receive() external payable {}

    // Unique marker to differentiate runtime bytecode on explorers
    function __proxyKind() external pure returns (bytes32) {
        return keccak256("VARProxy");
    }
}
