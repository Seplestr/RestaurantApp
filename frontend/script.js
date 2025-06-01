document.addEventListener('DOMContentLoaded', () => {
    const addMenuItemForm = document.getElementById('add-menu-item-form');
    const menuItemsContainer = document.getElementById('menu-items-container');

    // Function to fetch and display menu items (to be implemented)
    async function fetchMenuItems() {
        try {
            const response = await fetch('/api/menu');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const responseData = await response.json(); // Changed 'items' to 'responseData'
            renderMenuItems(responseData.data); // Access the 'data' property
        } catch (error) {
            console.error('Error fetching menu items:', error);
            menuItemsContainer.innerHTML = '<p>Error loading menu items.</p>';
        }
    }

    // Function to render menu items in the DOM
    function renderMenuItems(items) {
        menuItemsContainer.innerHTML = ''; // Clear existing items
        if (items.length === 0) {
            menuItemsContainer.innerHTML = '<p>No menu items available.</p>';
            return;
        }
        items.forEach(item => {
            const itemDiv = document.createElement('div');
            itemDiv.classList.add('menu-item');
            itemDiv.innerHTML = `
                 <h4>${item.name} (${item.category})</h4>
                 <p>Price: ₹${item.price.toFixed(2)}</p>
                 <p>Ingredients: ${item.ingredients ? item.ingredients.join(', ') : 'N/A'}</p>
                  <p>Tags: ${item.tags ? item.tags.join(', ') : 'N/A'}</p>
                <p>Available: ${item.availability ? 'Yes' : 'No'}</p>
                <button onclick="editMenuItem('${item._id}')">Edit</button>
                <button onclick="deleteMenuItem('${item._id}')">Delete</button>
            `;
            menuItemsContainer.appendChild(itemDiv);
        });
    }

    // Event listener for adding or updating a new menu item
    if (addMenuItemForm) {
        addMenuItemForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            const formData = new FormData(addMenuItemForm);
            const itemData = {
                name: formData.get('itemName'),
                category: formData.get('itemCategory'),
                price: parseFloat(formData.get('itemPrice')),
                ingredients: formData.get('itemIngredients').split(',').map(s => s.trim()).filter(s => s),
                tags: formData.get('itemTags').split(',').map(s => s.trim()).filter(s => s),
                availability: formData.get('itemAvailability') === 'on'
            };

            try {
                let response;
                let url = '/api/menu';
                let method = 'POST';

                if (editingItemId) {
                    url = `/api/menu/${editingItemId}`;
                    method = 'PUT';
                }

                response = await fetch(url, {
                    method: method,
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(itemData)
                });

                if (!response.ok) {
                    // MODIFICATION START
                    let errorData;
                    const contentType = response.headers.get('content-type');
                    if (contentType && contentType.includes('application/json')) {
                        errorData = await response.json();
                    } else {
                        // If not JSON, get the response as text
                        const errorText = await response.text();
                        // We'll use the text as the message, or a default if it's empty
                        errorData = { message: errorText || `HTTP error! status: ${response.status}` }; 
                    }
                    throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
                    // MODIFICATION END
                }

                const resultItem = await response.json();
                console.log(`Menu item ${editingItemId ? 'updated' : 'added'}:`, resultItem);
                addMenuItemForm.reset();
                document.querySelector('#add-menu-item-form button[type="submit"]').textContent = 'Add Item'; // Reset button text
                editingItemId = null; // Reset editing state
                fetchMenuItems(); // Refresh the list
            } catch (error) {
                console.error(`Error ${editingItemId ? 'updating' : 'adding'} menu item:`, error);
                alert(`Error ${editingItemId ? 'updating' : 'adding'} menu item: ${error.message}`);
            }
        });
    }

    let editingItemId = null; // Variable to store the ID of the item being edited

    // Function to populate the form for editing
    async function populateEditForm(itemId) {
        try {
            const response = await fetch(`/api/menu/${itemId}`);
            if (!response.ok) {
                let errorMsg = `HTTP error! status: ${response.status}`;
                try {
                    const errorData = await response.json();
                    if (errorData && errorData.message) {
                        errorMsg = errorData.message;
                    }
                } catch (e) {
                    errorMsg = response.statusText || errorMsg;
                }
                throw new Error(errorMsg);
            }
            const responseData = await response.json(); // Get the full response
            const item = responseData.data || responseData; // Check for a 'data' property, or use the response directly

            if (!item || typeof item !== 'object') {
                throw new Error('Fetched item data is not in the expected format.');
            }

            document.getElementById('itemName').value = item.name || '';
            document.getElementById('itemCategory').value = item.category || '';
            document.getElementById('itemPrice').value = item.price || '';
            document.getElementById('itemIngredients').value = item.ingredients ? item.ingredients.join(', ') : '';
            document.getElementById('itemTags').value = item.tags ? item.tags.join(', ') : '';
            document.getElementById('itemAvailability').checked = item.availability || false;

            document.querySelector('#add-menu-item-form button[type="submit"]').textContent = 'Update Item';
            editingItemId = itemId;
            document.getElementById('add-menu-item-form').scrollIntoView();
        } catch (error) {
            console.error('Error fetching item for edit:', error);
            alert(`Error populating form for editing: ${error.message}`);
        }
    }

    window.editMenuItem = async (itemId) => {
        console.log('Edit item:', itemId);
        populateEditForm(itemId);
    };

    window.deleteMenuItem = async (itemId) => {
        console.log('Delete item:', itemId);
        // Implementation for deleting a menu item
        if (confirm('Are you sure you want to delete this item?')) {
            try {
                const response = await fetch(`/api/menu/${itemId}`, {
                    method: 'DELETE'
                });
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
                }
                console.log('Item deleted');
                fetchMenuItems(); // Refresh the list
            } catch (error) {
                console.error('Error deleting item:', error);
                alert(`Error deleting item: ${error.message}`);
            }
        }
    };

    // --- Order Management --- //
    const menuItemsListForOrder = document.getElementById('menu-items-list-for-order');
    const cartItemsList = document.getElementById('cart-items-list');
    const cartTotalSpan = document.getElementById('cart-total');
    const orderNotesTextarea = document.getElementById('orderNotes');
    const placeOrderButton = document.getElementById('place-order-button');
    const ordersListContainer = document.getElementById('orders-list-container'); // Get the new container
    let currentCart = []; // To store { itemId, name, price, quantity }

    // Function to fetch menu items specifically for the ordering section
    async function fetchMenuItemsForOrdering() {
        try {
            const response = await fetch('/api/menu?limit=100'); // Fetch more items for selection
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const responseData = await response.json();
            renderMenuItemsForOrdering(responseData.data);
        } catch (error) {
            console.error('Error fetching menu items for ordering:', error);
            if (menuItemsListForOrder) menuItemsListForOrder.innerHTML = '<p>Error loading menu items.</p>';
        }
    }

    // Function to render menu items for the ordering section
    function renderMenuItemsForOrdering(items) {
        if (!menuItemsListForOrder) return;
        menuItemsListForOrder.innerHTML = '';
        if (!items || items.length === 0) {
            menuItemsListForOrder.innerHTML = '<p>No menu items available to order.</p>';
            return;
        }
        items.forEach(item => {
            // if (!item.availability) return; // Removed this line as we want to show unavailable items but disable the button
            const itemDiv = document.createElement('div');
            itemDiv.classList.add('menu-item-order-option', 'menu-item-for-order');
            const buttonHtml = item.availability
                ? `<button data-item-id="${item._id}" data-item-name="${item.name}" data-item-price="${item.price}">Add to Order</button>`
                : `<button disabled>Unavailable</button>`; // Disable button if not available
            itemDiv.innerHTML = `
                <span>${item.name} (₹${item.price.toFixed(2)})</span>
                ${buttonHtml}
            `;
            if (item.availability) {
                itemDiv.querySelector('button').addEventListener('click', () => addItemToCart(item._id, item.name, item.price));
            }
            menuItemsListForOrder.appendChild(itemDiv);
        });
    }

    // Function to add an item to the cart or increment its quantity
    function addItemToCart(itemId, name, price) {
        const existingItem = currentCart.find(cartItem => cartItem.itemId === itemId);
        if (existingItem) {
            existingItem.quantity++;
        } else {
            currentCart.push({ itemId, name, price, quantity: 1 });
        }
        renderCart();
    }

    // Function to remove an item from the cart or decrement its quantity
    function removeItemFromCart(itemId) {
        const itemIndex = currentCart.findIndex(cartItem => cartItem.itemId === itemId);
        if (itemIndex > -1) {
            currentCart[itemIndex].quantity--;
            if (currentCart[itemIndex].quantity <= 0) {
                currentCart.splice(itemIndex, 1);
            }
        }
        renderCart();
    }

    // Function to render the current cart
    function renderCart() {
        if (!cartItemsList) return;
        cartItemsList.innerHTML = '';
        let total = 0;
        if (currentCart.length === 0) {
            cartItemsList.innerHTML = '<p>Your order is empty.</p>';
        } else {
            currentCart.forEach(item => {
                const cartItemDiv = document.createElement('div');
                cartItemDiv.classList.add('cart-item');
                cartItemDiv.innerHTML = `
                    <span>${item.name} (x${item.quantity}) - ₹${(item.price * item.quantity).toFixed(2)}</span>
                    <div>
                        <button class="quantity-adjust" data-item-id="${item.itemId}" data-action="decrease">-</button>
                        <button class="quantity-adjust" data-item-id="${item.itemId}" data-action="increase">+</button>
                    </div>
                `;
                cartItemDiv.querySelectorAll('.quantity-adjust').forEach(button => {
                    button.addEventListener('click', (e) => {
                        const action = e.target.dataset.action;
                        if (action === 'increase') {
                            addItemToCart(item.itemId, item.name, item.price);
                        } else if (action === 'decrease') {
                            removeItemFromCart(item.itemId);
                        }
                    });
                });
                cartItemsList.appendChild(cartItemDiv);
                total += item.price * item.quantity;
            });
        }
        if (cartTotalSpan) cartTotalSpan.textContent = `₹${total.toFixed(2)}`;
    }

    // Event listener for placing an order
    if (placeOrderButton) {
        placeOrderButton.addEventListener('click', async () => {
            if (currentCart.length === 0) {
                alert('Your order is empty. Please add items to your order.');
                return;
            }

            const orderData = {
                items: currentCart.map(item => ({ menuItemId: item.itemId, name: item.name, quantity: item.quantity, priceAtOrder: item.price })),
                totalAmount: parseFloat(currentCart.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2)),
                notes: orderNotesTextarea ? orderNotesTextarea.value : '',
                status: 'Placed' // Default status
            };

            try {
                const response = await fetch('/api/orders', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(orderData)
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
                }

                const newOrder = await response.json();
                console.log('Order placed:', newOrder);
                alert('Order placed successfully!');
                currentCart = [];
                if(orderNotesTextarea) orderNotesTextarea.value = '';
                renderCart();
                fetchOrders(); // Fetch and display updated orders
                // Optionally, redirect to an order confirmation page or clear the order section
            } catch (error) {
                console.error('Error placing order:', error);
                alert(`Error placing order: ${error.message}`);
            }
        });
    }

    // --- New Order Status & Tracking Functions --- //

    // Function to fetch existing orders
    async function fetchOrders() {
        try {
            const response = await fetch('/api/orders');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const orders = await response.json();
            renderOrders(orders); // Render the fetched orders
        } catch (error) {
            console.error('Error fetching orders:', error);
            if (ordersListContainer) ordersListContainer.innerHTML = '<p>Error loading orders.</p>';
        }
    }

    // Function to render existing orders in the DOM
    function renderOrders(orders) {
        if (!ordersListContainer) return;
        ordersListContainer.innerHTML = ''; // Clear existing orders
        if (!orders || orders.length === 0) {
            ordersListContainer.innerHTML = '<p>No orders placed yet.</p>';
            return;
        }
        orders.forEach(order => {
            const orderDiv = document.createElement('div');
            orderDiv.classList.add('order-item'); // Add a class for styling
            orderDiv.innerHTML = `
                <h4>Order ID: ${order._id}</h4>
                <p>Total: ₹${order.totalAmount.toFixed(2)}</p>
                <p>Placed: ${new Date(order.timestamp).toLocaleString()}</p>
                <div class="order-status">
                    Status: <span id="status-${order._id}"><strong>${order.status}</strong></span>
                    <select class="status-dropdown" data-order-id="${order._id}">
                        <option value="Placed">Placed</option>
                        <option value="In Preparation">In Preparation</option>
                        <option value="Ready">Ready</option>
                        <option value="Delivered">Delivered</option>
                    </select>
                </div>
                <!-- Add more details like items, customer name, notes if available -->
                <div class="order-items-list"></div>
            `;

            const orderItemsListDiv = orderDiv.querySelector('.order-items-list');
            order.items.forEach(item => {
                const itemP = document.createElement('p');
                itemP.textContent = `- ${item.name} x ${item.quantity} (₹${item.price.toFixed(2)} each)`;
                orderItemsListDiv.appendChild(itemP);
            });

            ordersListContainer.appendChild(orderDiv);

            // Set the current status in the dropdown and add event listener
            const statusDropdown = orderDiv.querySelector('.status-dropdown');
            statusDropdown.value = order.status;
            statusDropdown.addEventListener('change', handleStatusChange);
        });
    }

    // Function to handle status change from dropdown
    async function handleStatusChange(event) {
        const orderId = event.target.dataset.orderId;
        const newStatus = event.target.value;
        console.log(`Attempting to update order ${orderId} to status: ${newStatus}`);

        try {
            const response = await fetch(`/api/orders/${orderId}/status`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status: newStatus })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }

            const updatedOrder = await response.json();
            console.log('Order status updated:', updatedOrder);

            // Update the status text in the UI
            const statusSpan = document.getElementById(`status-${orderId}`);
            if (statusSpan) {
                statusSpan.textContent = updatedOrder.status;
            }

        } catch (error) {
            console.error('Error updating order status:', error);
            alert(`Failed to update order status: ${error.message}`);
            // Revert dropdown value on error
            fetchOrders(); // Or find a way to revert just this dropdown
        }
    }

    // Initial data fetch on page load
    fetchMenuItems(); // For menu management section
    fetchMenuItemsForOrdering(); // For order creation section
    fetchOrders(); // Fetch and display existing orders

    // Dynamic copyright year update
    const currentYearSpan = document.getElementById('currentYear');
    if (currentYearSpan) {
        currentYearSpan.textContent = new Date().getFullYear();
    }
});