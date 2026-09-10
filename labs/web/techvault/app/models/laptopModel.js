function createLaptopModel(db) {
  return {
    findAll({ brand, maxPrice } = {}) {
      let query = 'SELECT * FROM laptops WHERE 1=1';
      const params = [];
      if (brand) {
        query += ' AND brand = ?';
        params.push(brand);
      }
      if (typeof maxPrice === 'number') {
        query += ' AND price <= ?';
        params.push(maxPrice);
      }
      return db.prepare(query).all(...params);
    },

    findById(id) {
      return db.prepare('SELECT * FROM laptops WHERE id = ?').get(id);
    },
  };
}

module.exports = { createLaptopModel };
