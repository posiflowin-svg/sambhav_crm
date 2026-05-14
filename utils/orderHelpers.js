module.exports = {
  getStatusBadgeColor: function (status) {
    switch (status) {
      case 'created': return 'secondary';             // Gray
      case 'processing': return 'warning';            // Yellow
      case 'accountant_review': return 'warning';     // Yellow
      case 'accountant_approved': return 'primary';   // Blue
      case 'dispatch_packed': return 'dark';          // Dark Gray/Black (stands out)
      case 'dispatched': return 'info';               // Light Blue
      case 'shipped': return 'info';                  // Same as dispatched
      case 'delivered': return 'success';             // Green
      case 'completed': return 'success';             // Green
      case 'returned': return 'danger';               // Red
      case 'cancelled': return 'danger';              // Red
      default: return 'light';                        // Light Gray (fallback)
    }
  },

  getStatusIcon: (status) => {
    const icons = {
      created: 'bi-file-earmark-plus',
      processing: 'bi-gear',
      accountant_review: 'bi-file-earmark-check',
      accountant_approved: 'bi-check-circle-fill',
      dispatch_packed: 'bi-clock-history',
      dispatched: 'bi-truck',
      shipped: 'bi-truck',
      delivered: 'bi-check-circle',
      completed: 'bi-check-circle',
      returned: 'bi-arrow-return-left',
      cancelled: 'bi-x-circle',
    };
    return icons[status] || 'bi-question-circle';
  }
};
