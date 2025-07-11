const crypto = require('crypto');
const BigInteger = require('big-integer');

class Node {
  constructor(ip, port, m = 160) {
    this.ip = ip;
    this.port = port;
    this.m = m;
    this.id = this.hashKey(`${ip}:${port}`);
    this.fingerTable = new Array(m).fill(null);
    this.successor = null;
    this.predecessor = null;
    this.dataStore = new Map();
  }

  hashKey(key) {
  const hash = crypto.createHash('sha1').update(key).digest('hex');
  return BigInteger(hash, 16).mod(BigInteger(2).pow(160)); // Fixed
	}
  // Checks if this node is responsible for the given keyId
  async isResponsible(keyId) {
  if (this.predecessor) {
    if (this.predecessor.id.lesser(this.id)) { 
          return this.predecessor.id.lesser(keyId) && keyId.leq(this.id); 
    } else {
      return keyId.greater(this.predecessor.id) || keyId.leq(this.id); 
    }
  } else {
    return keyId.leq(this.id) || keyId.greater(this.successor.id); 
  }
}

closestPrecedingNode(keyId) {
  for (let i = this.fingerTable.length - 1; i >= 0; i--) {
    const finger = this.fingerTable[i];
    if (finger && finger.id.lesser(keyId) && finger.id.neq(this.id)) { 
      return finger;
    }
  }
  return this.successor;
}

  // Find the successor node responsible for keyId
  async findSuccessor(keyId) {
    if (await this.isResponsible(keyId)) {
      return this;
    } else {
      const closestNode = this.closestPrecedingNode(keyId);
      if (closestNode === this) return this; // Safety for single-node
      return await closestNode.findSuccessor(keyId);
    }
  }

  // Build the finger table using an existing node in the network
  async buildFingerTable(existingNode) {
    for (let i = 0; i < this.fingerTable.length; i++) {
      const fingerId = this.id.add(BigInteger(2).pow(i)).mod(BigInteger(2).pow(this.m));
      this.fingerTable[i] = await existingNode.findSuccessor(fingerId);
    }
  }

  // Join the network using an existing node
  async join(existingNode) {
    this.predecessor = null;
    this.successor = await existingNode.findSuccessor(this.id);
    await this.buildFingerTable(existingNode);
    // Transfer keys from successor if needed (not implemented here)
  }

  // Periodically verify and correct successor/predecessor pointers
  async stabilize() {
    const x = await this.successor.getPredecessor();
    if (x && (x.id.gt(this.id) && x.id.lt(this.successor.id))) {
      this.successor = x;
    }
    await this.successor.notify(this);
  }

  // Called by other nodes to suggest a new predecessor
  async notify(node) {
    if (!this.predecessor || node.id.gt(this.predecessor.id) && node.id.lt(this.id)) {
      this.predecessor = node;
    }
  }

  // For demonstration: get predecessor (simulate network call)
  async getPredecessor() {
    return this.predecessor;
  }

  // Store a key-value pair in the DHT
  async store(key, value) {
    const keyId = this.hashKey(key);
    const responsibleNode = await this.findSuccessor(keyId);
    responsibleNode.dataStore.set(key, value);
  }

  // Lookup a value by key in the DHT
  async lookup(key) {
    const keyId = this.hashKey(key);
    const responsibleNode = await this.findSuccessor(keyId);
    return responsibleNode.dataStore.get(key);
  }

  // Utility for debugging
  info() {
    return {
      ip: this.ip,
      port: this.port,
      id: this.id.toString(),
      successor: this.successor ? this.successor.id.toString() : null,
      predecessor: this.predecessor ? this.predecessor.id.toString() : null
    };
  }
}

// Example usage (single process, no real networking):
(async () => {
  // Create a bootstrap node
  const nodeA = new Node('127.0.0.1', 5000);
  nodeA.successor = nodeA; // First node points to itself

  // Add a second node
  const nodeB = new Node('127.0.0.1', 5001);
  await nodeB.join(nodeA);

  // Store and lookup
  await nodeA.store('hello', 'world');
  const result = await nodeB.lookup('hello');
  console.log('Lookup result:', result);

  // Print node info
  console.log('Node A:', nodeA.info());
  console.log('Node B:', nodeB.info());
})();
