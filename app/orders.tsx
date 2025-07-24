import { onAuthStateChanged, User } from 'firebase/auth';
import {
    collection,
    doc,
    getDoc,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    Timestamp,
    updateDoc,
    where
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    FlatList,
    Image,
    Linking,
    Modal,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { auth, db } from '../firebaseConfig';

const { width } = Dimensions.get('window');

// Types
interface DeliveryAddress {
  city: string;
  pincode: string;
  state: string;
  street: string;
}

interface OrderItem {
  imageUrl: string;
  name: string;
  price: number;
  productId: string;
  quantity: number;
  shopId: string;
}

interface Order {
  id: string;
  cancelledAt?: Timestamp;
  createdAt: Timestamp;
  customerNotes?: string;
  deliveryAddress?: DeliveryAddress;
  deliveryFee?: number;
  items: OrderItem[];
  orderId: string;
  paymentMethod: 'cash' | 'online' | 'card';
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded';
  status: 'placed' | 'confirmed' | 'preparing' | 'out_for_delivery' | 'delivered' | 'cancelled';
  total: number;
  totalAmount: number;
  updatedAt: Timestamp;
  userEmail: string;
  userId: string;
}

interface UserData {
  name?: string;
  firstName?: string;
  displayName?: string;
  email?: string;
  address?: DeliveryAddress;
  phone?: string;
}

interface Shopkeeper {
  id: string;
  name: string;
  phone: string;
  email?: string;
  shopName?: string;
  address?: string;
}

const Orders: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [addressModalVisible, setAddressModalVisible] = useState(false);
  const [shopkeeperModalVisible, setShopkeeperModalVisible] = useState(false);
  const [shopkeeperListModalVisible, setShopkeeperListModalVisible] = useState(false);
  const [cashAmount, setCashAmount] = useState('');
  const [unsubscribeOrders, setUnsubscribeOrders] = useState<(() => void) | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [shopkeepers, setShopkeepers] = useState<{[key: string]: Shopkeeper}>({});
  const [selectedShopkeeper, setSelectedShopkeeper] = useState<Shopkeeper | null>(null);
  const [orderShopkeepers, setOrderShopkeepers] = useState<Shopkeeper[]>([]);
  const [loadingShopkeepers, setLoadingShopkeepers] = useState(false);
  
  // Address form states
  const [newAddress, setNewAddress] = useState({
    street: '',
    city: '',
    state: '',
    pincode: ''
  });

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      console.log('Auth state changed:', currentUser?.uid);
      
      // Clean up previous orders subscription
      if (unsubscribeOrders) {
        unsubscribeOrders();
        setUnsubscribeOrders(null);
      }
      
      setUser(currentUser);
      setAuthLoading(false);
      
      if (currentUser) {
        fetchUserData(currentUser.uid);
        const unsubscribe = fetchOrders(currentUser.uid);
        setUnsubscribeOrders(() => unsubscribe);
      } else {
        // Reset state when user logs out
        setOrders([]);
        setUserData(null);
        setLoading(false);
        setOrdersLoaded(false);
        setSelectedOrder(null);
        setModalVisible(false);
        setPaymentModalVisible(false);
        setAddressModalVisible(false);
        setShopkeeperModalVisible(false);
        setShopkeeperListModalVisible(false);
        setCashAmount('');
        setShopkeepers({});
        setSelectedShopkeeper(null);
        setOrderShopkeepers([]);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeOrders) {
        unsubscribeOrders();
      }
    };
  }, []);

  const fetchUserData = async (userId: string) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        setUserData(userDoc.data() as UserData);
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    }
  };

  const fetchShopkeeperData = async (shopId: string): Promise<Shopkeeper | null> => {
    try {
      // Check if we already have this shopkeeper's data
      if (shopkeepers[shopId]) {
        return shopkeepers[shopId];
      }

      console.log('Fetching shopkeeper data for shopId:', shopId);
      const shopkeeperDoc = await getDoc(doc(db, 'shopkeepers', shopId));
      
      if (shopkeeperDoc.exists()) {
        const data = shopkeeperDoc.data();
        const shopkeeperData = {
          id: shopId,
          name: data.name || data.ownerName || 'Unknown',
          phone: data.phone || data.phoneNumber || '',
          email: data.email || '',
          shopName: data.shopName || data.name || '',
          address: data.address || ''
        } as Shopkeeper;
        
        console.log('Fetched shopkeeper data:', shopkeeperData);
        
        // Cache the shopkeeper data
        setShopkeepers(prev => ({
          ...prev,
          [shopId]: shopkeeperData
        }));
        
        return shopkeeperData;
      } else {
        console.log('No shopkeeper document found for shopId:', shopId);
        return null;
      }
    } catch (error) {
      console.error('Error fetching shopkeeper data for shopId:', shopId, error);
      return null;
    }
  };

  const getShopkeepersForOrder = async (order: Order): Promise<Shopkeeper[]> => {
    try {
      setLoadingShopkeepers(true);
      const uniqueShopIds = [...new Set(order.items.map(item => item.shopId))];
      console.log('Getting shopkeepers for shop IDs:', uniqueShopIds);
      
      const shopkeeperPromises = uniqueShopIds.map(shopId => fetchShopkeeperData(shopId));
      const shopkeeperResults = await Promise.all(shopkeeperPromises);
      
      const validShopkeepers = shopkeeperResults.filter(shopkeeper => shopkeeper !== null) as Shopkeeper[];
      console.log('Valid shopkeepers found:', validShopkeepers);
      
      setLoadingShopkeepers(false);
      return validShopkeepers;
    } catch (error) {
      console.error('Error getting shopkeepers for order:', error);
      setLoadingShopkeepers(false);
      return [];
    }
  };

  const makePhoneCall = (phone: string, shopkeeperName: string) => {
    if (!phone || phone.trim() === '') {
      Alert.alert('Error', 'Phone number not available for this shopkeeper');
      return;
    }

    // Clean phone number (remove spaces, dashes, etc.)
    const cleanPhone = phone.replace(/[^\d+]/g, '');
    
    Alert.alert(
      'Call Shopkeeper',
      `Call ${shopkeeperName} at ${phone}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Call', 
          onPress: () => {
            console.log('Making call to:', cleanPhone);
            Linking.openURL(`tel:${cleanPhone}`)
              .then(() => {
                console.log('Call initiated successfully');
              })
              .catch((error) => {
                console.error('Error making phone call:', error);
                Alert.alert('Error', 'Unable to make phone call. Please check if the phone number is valid.');
              });
          }
        }
      ]
    );
  };

  const showShopkeeperSelection = async (order: Order) => {
    try {
      console.log('Showing shopkeeper selection for order:', order.id);
      const shopkeepersData = await getShopkeepersForOrder(order);
      
      if (shopkeepersData.length === 0) {
        Alert.alert('Error', 'No shopkeeper information available for this order');
        return;
      }

      if (shopkeepersData.length === 1) {
        // Single shopkeeper - show details directly
        const shopkeeper = shopkeepersData[0];
        if (shopkeeper.phone && shopkeeper.phone.trim() !== '') {
          makePhoneCall(shopkeeper.phone, shopkeeper.name);
        } else {
          Alert.alert('Error', 'Phone number not available for this shopkeeper');
        }
      } else {
        // Multiple shopkeepers - show selection list
        setOrderShopkeepers(shopkeepersData);
        setShopkeeperListModalVisible(true);
      }
    } catch (error) {
      console.error('Error showing shopkeeper selection:', error);
      Alert.alert('Error', 'Failed to fetch shopkeeper details');
    }
  };

  const showShopkeeperDetails = (shopkeeper: Shopkeeper) => {
    setSelectedShopkeeper(shopkeeper);
    setShopkeeperListModalVisible(false);
    setShopkeeperModalVisible(true);
  };

  const getUserDisplayName = () => {
    if (userData?.name) return userData.name;
    if (userData?.firstName) return userData.firstName;
    if (userData?.displayName) return userData.displayName;
    if (user?.displayName) return user.displayName;
    if (user?.email) return user.email.split('@')[0];
    return 'User';
  };

  const getDeliveryAddress = (order: Order): DeliveryAddress | null => {
    // First check order's delivery address
    if (order.deliveryAddress) {
      return order.deliveryAddress;
    }
    
    // Then check user's address
    if (userData?.address) {
      return userData.address;
    }
    
    return null;
  };

  const saveUserAddress = async () => {
    if (!user || !newAddress.street || !newAddress.city || !newAddress.state || !newAddress.pincode) {
      Alert.alert('Error', 'Please fill in all address fields');
      return;
    }

    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        address: newAddress,
        updatedAt: serverTimestamp()
      });
      
      // Update local user data
      setUserData(prev => ({
        ...prev,
        address: newAddress
      }));
      
      setAddressModalVisible(false);
      setNewAddress({ street: '', city: '', state: '', pincode: '' });
      Alert.alert('Success', 'Address saved successfully');
    } catch (error) {
      console.error('Error saving address:', error);
      Alert.alert('Error', 'Failed to save address. Please try again.');
    }
  };

  const fetchOrders = (userId: string) => {
    console.log('Fetching orders for user:', userId);
    setLoading(true);
    setOrdersLoaded(false);
    
    const ordersQuery = query(
      collection(db, 'orders'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(ordersQuery, (snapshot) => {
      console.log('Orders snapshot received, size:', snapshot.size);
      const ordersData: Order[] = [];
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        console.log('Processing order:', doc.id, data);
        
        // Parse delivery address properly
        let deliveryAddress = null;
        if (data.deliveryAddress) {
          if (Array.isArray(data.deliveryAddress) && data.deliveryAddress.length > 0) {
            deliveryAddress = data.deliveryAddress[0];
          } else if (typeof data.deliveryAddress === 'object') {
            deliveryAddress = data.deliveryAddress;
          }
        }
        
        ordersData.push({
          id: doc.id,
          cancelledAt: data.cancelledAt,
          createdAt: data.createdAt,
          customerNotes: data.customerNotes || '',
          deliveryAddress: deliveryAddress ? {
            city: deliveryAddress.city || '',
            pincode: deliveryAddress.pincode || '',
            state: deliveryAddress.state || '',
            street: deliveryAddress.street || ''
          } : undefined,
          deliveryFee: Number(data.deliveryFee) || 0,
          items: data.items || [],
          orderId: data.orderId || '',
          paymentMethod: data.paymentMethod || 'cash',
          paymentStatus: data.paymentStatus || 'pending',
          status: data.status || 'placed',
          total: Number(data.total) || 0,
          totalAmount: Number(data.totalAmount) || Number(data.total) || 0,
          updatedAt: data.updatedAt,
          userEmail: data.userEmail || '',
          userId: data.userId || ''
        } as Order);
      });
      
      console.log('Setting orders:', ordersData.length);
      setOrders(ordersData);
      setLoading(false);
      setRefreshing(false);
      setOrdersLoaded(true);
    }, (error) => {
      console.error('Error fetching orders:', error);
      setLoading(false);
      setRefreshing(false);
      setOrdersLoaded(true);
      Alert.alert('Error', 'Failed to fetch orders. Please try again.');
    });

    return unsubscribe;
  };

  const onRefresh = () => {
    if (user) {
      setRefreshing(true);
      // Clean up and re-fetch
      if (unsubscribeOrders) {
        unsubscribeOrders();
      }
      const unsubscribe = fetchOrders(user.uid);
      setUnsubscribeOrders(() => unsubscribe);
    }
  };

  const cancelOrder = async (orderId: string) => {
    try {
      const orderRef = doc(db, 'orders', orderId);
      await updateDoc(orderRef, {
        status: 'cancelled',
        cancelledAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      
      Alert.alert('Success', 'Order cancelled successfully');
    } catch (error) {
      console.error('Error cancelling order:', error);
      Alert.alert('Error', 'Failed to cancel order. Please try again.');
    }
  };

  const confirmCashPayment = async (orderId: string, amount: number) => {
    if (!cashAmount || parseFloat(cashAmount) !== amount) {
      Alert.alert('Error', 'Please enter the correct cash amount');
      return;
    }

    try {
      const orderRef = doc(db, 'orders', orderId);
      await updateDoc(orderRef, {
        paymentStatus: 'paid',
        updatedAt: serverTimestamp()
      });
      
      setPaymentModalVisible(false);
      setCashAmount('');
      Alert.alert('Success', 'Cash payment confirmed');
    } catch (error) {
      console.error('Error confirming payment:', error);
      Alert.alert('Error', 'Failed to confirm payment. Please try again.');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'placed': return '#FF6B35';
      case 'confirmed': return '#4A90E2';
      case 'preparing': return '#F5A623';
      case 'out_for_delivery': return '#7ED321';
      case 'delivered': return '#50E3C2';
      case 'cancelled': return '#D0021B';
      default: return '#9B9B9B';
    }
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return '#50E3C2';
      case 'pending': return '#F5A623';
      case 'failed': return '#D0021B';
      case 'refunded': return '#4A90E2';
      default: return '#9B9B9B';
    }
  };

  const formatDate = (timestamp: Timestamp | null | undefined) => {
    if (!timestamp) return 'N/A';
    try {
      const date = timestamp.toDate();
      const now = new Date();
      const diffTime = Math.abs(now.getTime() - date.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays === 1) {
        return 'Today';
      } else if (diffDays === 2) {
        return 'Yesterday';
      } else if (diffDays <= 7) {
        return `${diffDays - 1} days ago`;
      } else {
        return date.toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        });
      }
    } catch (error) {
      return 'Invalid Date';
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const canCancelOrder = (order: Order) => {
    return ['placed', 'confirmed'].includes(order.status) && !order.cancelledAt;
  };

  const showCashPaymentOption = (order: Order) => {
    return order.paymentMethod === 'cash' && 
           order.paymentStatus === 'pending' && 
           order.status === 'delivered';
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'placed': return '📝';
      case 'confirmed': return '✅';
      case 'preparing': return '👨‍🍳';
      case 'out_for_delivery': return '🚚';
      case 'delivered': return '📦';
      case 'cancelled': return '❌';
      default: return '📋';
    }
  };

  const renderOrderItem = ({ item }: { item: Order }) => (
    <TouchableOpacity 
      style={styles.orderCard}
      onPress={() => {
        setSelectedOrder(item);
        setModalVisible(true);
      }}
      activeOpacity={0.7}
    >
      <View style={styles.orderHeader}>
        <View style={styles.orderIdContainer}>
          <Text style={styles.orderIdLabel}>Order</Text>
          <Text style={styles.orderId}>#{item.orderId}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
          <Text style={styles.statusIcon}>{getStatusIcon(item.status)}</Text>
          <Text style={styles.statusText}>{item.status.replace('_', ' ').toUpperCase()}</Text>
        </View>
      </View>

      <Text style={styles.orderDate}>{formatDate(item.createdAt)}</Text>

      <View style={styles.itemsPreview}>
        {item.items && item.items.length > 0 ? (
          <>
            <View style={styles.itemsRow}>
              {item.items.slice(0, 3).map((product, index) => (
                <View key={index} style={styles.itemPreview}>
                  <Image 
                    source={{ uri: product.imageUrl || 'https://via.placeholder.com/60' }} 
                    style={styles.itemImage} 
                    onError={() => console.log('Image load error')}
                  />
                  <View style={styles.itemDetails}>
                    <Text style={styles.itemName} numberOfLines={1}>
                      {product.name || 'Unknown Product'}
                    </Text>
                    <Text style={styles.itemQuantity}>Qty: {product.quantity || 0}</Text>
                    <Text style={styles.itemPrice}>₹{product.price || 0}</Text>
                  </View>
                </View>
              ))}
            </View>
            {item.items.length > 3 && (
              <View style={styles.moreItemsContainer}>
                <Text style={styles.moreItems}>+{item.items.length - 3} more items</Text>
              </View>
            )}
          </>
        ) : (
          <Text style={styles.noItems}>No items found</Text>
        )}
      </View>

      <View style={styles.orderFooter}>
        <View style={styles.paymentInfo}>
          <View style={styles.paymentMethodContainer}>
            <Text style={styles.paymentMethodLabel}>Payment:</Text>
            <Text style={styles.paymentMethod}>{item.paymentMethod.toUpperCase()}</Text>
          </View>
          <View style={[styles.paymentStatusBadge, { backgroundColor: getPaymentStatusColor(item.paymentStatus) }]}>
            <Text style={styles.paymentStatusText}>{item.paymentStatus.toUpperCase()}</Text>
          </View>
        </View>
        <View style={styles.totalContainer}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalAmount}>₹{item.total || item.totalAmount}</Text>
        </View>
      </View>

      <View style={styles.actionButtons}>
        {/* Contact Shopkeeper Button */}
        <TouchableOpacity 
          style={styles.contactButton}
          onPress={() => showShopkeeperSelection(item)}
          disabled={loadingShopkeepers}
        >
          <Text style={styles.contactButtonText}>
            {loadingShopkeepers ? '⏳ Loading...' : '📞 Contact Shop'}
          </Text>
        </TouchableOpacity>

        {canCancelOrder(item) && (
          <TouchableOpacity 
            style={styles.cancelButton}
            onPress={() => {
              Alert.alert(
                'Cancel Order',
                'Are you sure you want to cancel this order?',
                [
                  { text: 'No', style: 'cancel' },
                  { text: 'Yes', onPress: () => cancelOrder(item.id) }
                ]
              );
            }}
          >
            <Text style={styles.cancelButtonText}>Cancel Order</Text>
          </TouchableOpacity>
        )}

        {showCashPaymentOption(item) && (
          <TouchableOpacity 
            style={styles.payButton}
            onPress={() => {
              setSelectedOrder(item);
              setPaymentModalVisible(true);
            }}
          >
            <Text style={styles.payButtonText}>Confirm Payment</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );

  // Show loading while auth is being determined or orders are being fetched
  if (authLoading || (user && loading && !ordersLoaded)) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4A90E2" />
        <Text style={styles.loadingText}>
          {authLoading ? 'Checking authentication...' : 'Loading your orders...'}
        </Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>🔐</Text>
        <Text style={styles.emptyText}>Please log in to view your orders</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.greetingSection}>
          <Text style={styles.greeting}>Hello, {getUserDisplayName()}! 👋</Text>
          <Text style={styles.subGreeting}>Here are your recent orders</Text>
        </View>
      </View>
      
      {orders.length === 0 && ordersLoaded ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>🛍️</Text>
          <Text style={styles.emptyText}>No orders found</Text>
          <Text style={styles.emptySubtext}>Start shopping to see your orders here!</Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          renderItem={renderOrderItem}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={onRefresh}
              colors={['#4A90E2']}
              tintColor="#4A90E2"
            />
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContainer}
        />
      )}

      {/* Order Details Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {selectedOrder && (
                <>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Order Details</Text>
                    <TouchableOpacity 
                      onPress={() => setModalVisible(false)}
                      style={styles.closeButton}
                    >
                      <Text style={styles.closeButtonText}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.orderDetailSection}>
                    <Text style={styles.sectionTitle}>📋 Order Information</Text>
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Order ID:</Text>
                      <Text style={styles.infoValue}>{selectedOrder.orderId}</Text>
                    </View>
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Date:</Text>
                      <Text style={styles.infoValue}>{formatDate(selectedOrder.createdAt)}</Text>
                    </View>
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Status:</Text>
                      <View style={[styles.statusBadge, { backgroundColor: getStatusColor(selectedOrder.status) }]}>
                        <Text style={styles.statusText}>{selectedOrder.status.replace('_', ' ').toUpperCase()}</Text>
                      </View>
                    </View>
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Payment:</Text>
                      <Text style={styles.infoValue}>
                        {selectedOrder.paymentMethod.toUpperCase()} ({selectedOrder.paymentStatus})
                      </Text>
                    </View>
                  </View>

                  <View style={styles.orderDetailSection}>
                    <Text style={styles.sectionTitle}>🏠 Delivery Address</Text>
                    {(() => {
                      const address = getDeliveryAddress(selectedOrder);
                      if (address) {
                        return (
                          <View style={styles.addressContainer}>
                            <Text style={styles.addressText}>{address.street}</Text>
                            <Text style={styles.addressText}>{address.city}, {address.state}</Text>
                            <Text style={styles.addressText}>PIN: {address.pincode}</Text>
                          </View>
                        );
                      } else {
                        return (
                          <View style={styles.noAddressContainer}>
                            <Text style={styles.noAddress}>No delivery address available</Text>
                            <TouchableOpacity 
                              style={styles.addAddressButton}
                              onPress={() => setAddressModalVisible(true)}
                            >
                              <Text style={styles.addAddressButtonText}>Add Address</Text>
                            </TouchableOpacity>
                          </View>
                        );
                      }
                    })()}
                  </View>

                  <View style={styles.orderDetailSection}>
                    <Text style={styles.sectionTitle}>🛍️ Items ({selectedOrder.items?.length || 0})</Text>
                    {selectedOrder.items && selectedOrder.items.length > 0 ? (
                      selectedOrder.items.map((item, index) => (
                        <View key={index} style={styles.modalItem}>
                          <Image 
                            source={{ uri: item.imageUrl || 'https://via.placeholder.com/60' }} 
                            style={styles.modalItemImage} 
                            onError={() => console.log('Modal image load error')}
                          />
                          <View style={styles.modalItemDetails}>
                            <Text style={styles.modalItemName}>{item.name || 'Unknown Product'}</Text>
                            <Text style={styles.modalItemPrice}>₹{item.price || 0} × {item.quantity || 0}</Text>
                          </View>
                          <Text style={styles.modalItemTotal}>₹{(item.price || 0) * (item.quantity || 0)}</Text>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.noItems}>No items found</Text>
                    )}
                  </View>

                  <View style={styles.orderDetailSection}>
                    <Text style={styles.sectionTitle}>💳 Payment Summary</Text>
                    <View style={styles.summaryContainer}>
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Subtotal:</Text>
                        <Text style={styles.summaryValue}>₹{(selectedOrder.total || selectedOrder.totalAmount) - (selectedOrder.deliveryFee || 0)}</Text>
                      </View>
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Delivery Fee:</Text>
                        <Text style={styles.summaryValue}>₹{selectedOrder.deliveryFee || 0}</Text>
                      </View>
                      <View style={[styles.summaryRow, styles.totalRow]}>
                        <Text style={styles.totalLabel}>Total:</Text>
                        <Text style={styles.totalValue}>₹{selectedOrder.total || selectedOrder.totalAmount}</Text>
                      </View>
                    </View>
                  </View>

                  {selectedOrder.customerNotes && (
                    <View style={styles.orderDetailSection}>
                      <Text style={styles.sectionTitle}>📝 Customer Notes</Text>
                      <Text style={styles.notesText}>{selectedOrder.customerNotes}</Text>
                    </View>
                  )}

                  {/* Modal Action Buttons */}
                  <View style={styles.modalActionButtons}>
                    <TouchableOpacity 
                      style={styles.modalContactButton}
                      onPress={() => {
                        setModalVisible(false);
                        showShopkeeperDetails(selectedOrder);
                      }}
                    >
                      <Text style={styles.modalContactButtonText}>📞 Contact Shop</Text>
                    </TouchableOpacity>

                    {canCancelOrder(selectedOrder) && (
                      <TouchableOpacity 
                        style={styles.modalCancelButton}
                        onPress={() => {
                          Alert.alert(
                            'Cancel Order',
                            'Are you sure you want to cancel this order?',
                            [
                              { text: 'No', style: 'cancel' },
                              { 
                                text: 'Yes', 
                                onPress: () => {
                                  cancelOrder(selectedOrder.id);
                                  setModalVisible(false);
                                }
                              }
                            ]
                          );
                        }}
                      >
                        <Text style={styles.modalCancelButtonText}>Cancel Order</Text>
                      </TouchableOpacity>
                    )}

                    {showCashPaymentOption(selectedOrder) && (
                      <TouchableOpacity 
                        style={styles.modalPayButton}
                        onPress={() => {
                          setModalVisible(false);
                          setPaymentModalVisible(true);
                        }}
                      >
                        <Text style={styles.modalPayButtonText}>Confirm Payment</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Shopkeeper Details Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={shopkeeperModalVisible}
        onRequestClose={() => setShopkeeperModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.shopkeeperModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Shopkeeper Details</Text>
              <TouchableOpacity 
                onPress={() => setShopkeeperModalVisible(false)}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            {selectedShopkeeper && (
              <View style={styles.shopkeeperDetails}>
                <View style={styles.shopkeeperHeader}>
                  <Text style={styles.shopkeeperIcon}>🏪</Text>
                  <View style={styles.shopkeeperInfo}>
                    <Text style={styles.shopkeeperName}>
                      {selectedShopkeeper.shopName || selectedShopkeeper.name}
                    </Text>
                    <Text style={styles.shopkeeperOwner}>
                      Owner: {selectedShopkeeper.name}
                    </Text>
                  </View>
                </View>

                {selectedShopkeeper.phone && (
                  <TouchableOpacity 
                    style={styles.callButton}
                    onPress={() => callShopkeeper(selectedShopkeeper.phone, selectedShopkeeper.name)}
                  >
                    <Text style={styles.callButtonIcon}>📞</Text>
                    <Text style={styles.callButtonText}>Call: {selectedShopkeeper.phone}</Text>
                  </TouchableOpacity>
                )}

                {selectedShopkeeper.email && (
                  <View style={styles.shopkeeperContactItem}>
                    <Text style={styles.contactIcon}>📧</Text>
                    <Text style={styles.contactText}>{selectedShopkeeper.email}</Text>
                  </View>
                )}

                {selectedShopkeeper.address && (
                  <View style={styles.shopkeeperContactItem}>
                    <Text style={styles.contactIcon}>📍</Text>
                    <Text style={styles.contactText}>{selectedShopkeeper.address}</Text>
                  </View>
                )}

                <View style={styles.shopkeeperActions}>
                  <TouchableOpacity 
                    style={styles.whatsappButton}
                    onPress={() => {
                      if (selectedShopkeeper.phone) {
                        const message = `Hi ${selectedShopkeeper.name}, I have a query regarding my order.`;
                        const whatsappUrl = `whatsapp://send?phone=${selectedShopkeeper.phone}&text=${encodeURIComponent(message)}`;
                        Linking.openURL(whatsappUrl).catch(() => {
                          Alert.alert('Error', 'WhatsApp is not installed on your device');
                        });
                      } else {
                        Alert.alert('Error', 'Phone number not available');
                      }
                    }}
                  >
                    <Text style={styles.whatsappButtonText}>💬 WhatsApp</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={styles.smsButton}
                    onPress={() => {
                      if (selectedShopkeeper.phone) {
                        const message = `Hi ${selectedShopkeeper.name}, I have a query regarding my order.`;
                        const smsUrl = `sms:${selectedShopkeeper.phone}?body=${encodeURIComponent(message)}`;
                        Linking.openURL(smsUrl).catch(() => {
                          Alert.alert('Error', 'Unable to open SMS app');
                        });
                      } else {
                        Alert.alert('Error', 'Phone number not available');
                      }
                    }}
                  >
                    <Text style={styles.smsButtonText}>💬 SMS</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Add Address Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={addressModalVisible}
        onRequestClose={() => setAddressModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.addressModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Delivery Address</Text>
              <TouchableOpacity 
                onPress={() => setAddressModalVisible(false)}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.addressForm}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Street Address *</Text>
                <TextInput
                  style={styles.addressInput}
                  placeholder="Enter street address"
                  value={newAddress.street}
                  onChangeText={(text) => setNewAddress(prev => ({ ...prev, street: text }))}
                  multiline
                  placeholderTextColor="#999"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>City *</Text>
                <TextInput
                  style={styles.addressInput}
                  placeholder="Enter city"
                  value={newAddress.city}
                  onChangeText={(text) => setNewAddress(prev => ({ ...prev, city: text }))}
                  placeholderTextColor="#999"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>State *</Text>
                <TextInput
                  style={styles.addressInput}
                  placeholder="Enter state"
                  value={newAddress.state}
                  onChangeText={(text) => setNewAddress(prev => ({ ...prev, state: text }))}
                  placeholderTextColor="#999"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Pin Code *</Text>
                <TextInput
                  style={styles.addressInput}
                  placeholder="Enter pin code"
                  value={newAddress.pincode}
                  onChangeText={(text) => setNewAddress(prev => ({ ...prev, pincode: text }))}
                  keyboardType="numeric"
                  placeholderTextColor="#999"
                />
              </View>

              <View style={styles.addressButtonsContainer}>
                <TouchableOpacity 
                  style={styles.addressCancelButton}
                  onPress={() => {
                    setAddressModalVisible(false);
                    setNewAddress({ street: '', city: '', state: '', pincode: '' });
                  }}
                >
                  <Text style={styles.addressCancelButtonText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.addressSaveButton}
                  onPress={saveUserAddress}
                >
                  <Text style={styles.addressSaveButtonText}>Save Address</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Cash Payment Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={paymentModalVisible}
        onRequestClose={() => setPaymentModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.paymentModalContent}>
            <Text style={styles.paymentModalTitle}>💰 Confirm Cash Payment</Text>
            
            {selectedOrder && (
              <>
                <View style={styles.paymentAmountContainer}>
                  <Text style={styles.paymentAmountLabel}>Amount to Pay:</Text>
                  <Text style={styles.paymentAmount}>₹{selectedOrder.total || selectedOrder.totalAmount}</Text>
                </View>
                
                <TextInput
                  style={styles.cashInput}
                  placeholder="Enter cash amount paid"
                  value={cashAmount}
                  onChangeText={setCashAmount}
                  keyboardType="numeric"
                  placeholderTextColor="#999"
                />
                
                <View style={styles.paymentButtonsContainer}>
                  <TouchableOpacity 
                    style={styles.paymentCancelButton}
                    onPress={() => {
                      setPaymentModalVisible(false);
                      setCashAmount('');
                    }}
                  >
                    <Text style={styles.paymentCancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={styles.paymentConfirmButton}
                    onPress={() => confirmCashPayment(selectedOrder.id, selectedOrder.total || selectedOrder.totalAmount)}
                  >
                    <Text style={styles.paymentConfirmButtonText}>Confirm Payment</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e1e8ed',
  },
  greetingSection: {
    marginBottom: 10,
  },
  greeting: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a202c',
    marginBottom: 4,
  },
  subGreeting: {
    fontSize: 16,
    color: '#718096',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#718096',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2d3748',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 16,
    color: '#718096',
    textAlign: 'center',
  },
  listContainer: {
    padding: 20,
  },
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  orderIdContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  orderIdLabel: {
    fontSize: 14,
    color: '#718096',
    marginRight: 4,
  },
  orderId: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a202c',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#fff',
  },
  orderDate: {
    fontSize: 14,
    color: '#718096',
    marginBottom: 12,
  },
  itemsPreview: {
    marginBottom: 16,
  },
  itemsRow: {
    flexDirection: 'column',
  },
  itemPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemImage: {
    width: 40,
    height: 40,
    borderRadius: 6,
    marginRight: 12,
  },
  itemDetails: {
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a202c',
    marginBottom: 2,
  },
  itemQuantity: {
    fontSize: 12,
    color: '#718096',
  },
  itemPrice: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4A90E2',
  },
  moreItemsContainer: {
    alignItems: 'center',
    marginTop: 8,
  },
  moreItems: {
    fontSize: 12,
    color: '#718096',
    fontStyle: 'italic',
  },
  noItems: {
    fontSize: 14,
    color: '#718096',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    marginBottom: 12,
  },
  paymentInfo: {
    flex: 1,
  },
  paymentMethodContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  paymentMethodLabel: {
    fontSize: 12,
    color: '#718096',
    marginRight: 4,
  },
  paymentMethod: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1a202c',
  },
  paymentStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  paymentStatusText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
  },
  totalContainer: {
    alignItems: 'flex-end',
  },
  totalLabel: {
    fontSize: 12,
    color: '#718096',
    marginBottom: 2,
  },
  totalAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a202c',
  },
  actionButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  contactButton: {
    backgroundColor: '#4A90E2',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    flex: 1,
    minWidth: 120,
  },
  contactButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  cancelButton: {
    backgroundColor: '#dc3545',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    flex: 1,
    minWidth: 120,
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  payButton: {
    backgroundColor: '#28a745',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    flex: 1,
    minWidth: 120,
  },
  payButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    width: width * 0.9,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a202c',
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#f7fafc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 18,
    color: '#718096',
  },
  orderDetailSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a202c',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 14,
    color: '#718096',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a202c',
  },
  addressContainer: {
    backgroundColor: '#f7fafc',
    padding: 12,
    borderRadius: 8,
  },
  addressText: {
    fontSize: 14,
    color: '#1a202c',
    marginBottom: 4,
  },
  noAddressContainer: {
    backgroundColor: '#f7fafc',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  noAddress: {
    fontSize: 14,
    color: '#718096',
    marginBottom: 8,
  },
  addAddressButton: {
    backgroundColor: '#4A90E2',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  addAddressButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalItemImage: {
    width: 50,
    height: 50,
    borderRadius: 8,
    marginRight: 12,
  },
  modalItemDetails: {
    flex: 1,
  },
  modalItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a202c',
    marginBottom: 4,
  },
  modalItemPrice: {
    fontSize: 12,
    color: '#718096',
  },
  modalItemTotal: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1a202c',
  },
  summaryContainer: {
    backgroundColor: '#f7fafc',
    padding: 12,
    borderRadius: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#718096',
  },
  summaryValue: {
    fontSize: 14,
    color: '#1a202c',
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 8,
    marginTop: 8,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a202c',
  },
  totalValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a202c',
  },
  notesText: {
    fontSize: 14,
    color: '#1a202c',
    backgroundColor: '#f7fafc',
    padding: 12,
    borderRadius: 8,
  },
  modalActionButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  modalContactButton: {
    backgroundColor: '#4A90E2',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    flex: 1,
    minWidth: 120,
  },
  modalContactButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  modalCancelButton: {
    backgroundColor: '#dc3545',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    flex: 1,
    minWidth: 120,
  },
  modalCancelButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  modalPayButton: {
    backgroundColor: '#28a745',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    flex: 1,
    minWidth: 120,
  },
  modalPayButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  shopkeeperModalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    width: width * 0.9,
    maxHeight: '70%',
  },
  shopkeeperDetails: {
    paddingVertical: 10,
  },
  shopkeeperHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  shopkeeperIcon: {
    fontSize: 40,
    marginRight: 15,
  },
  shopkeeperInfo: {
    flex: 1,
  },
  shopkeeperName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a202c',
    marginBottom: 4,
  },
  shopkeeperOwner: {
    fontSize: 14,
    color: '#718096',
  },
  callButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#28a745',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 15,
  },
  callButtonIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  callButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  shopkeeperContactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f7fafc',
    borderRadius: 8,
    marginBottom: 10,
  },
  contactIcon: {
    fontSize: 16,
    marginRight: 12,
  },
  contactText: {
    fontSize: 14,
    color: '#1a202c',
    flex: 1,
  },
  shopkeeperActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 15,
  },
  whatsappButton: {
    backgroundColor: '#25D366',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    flex: 1,
  },
  whatsappButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  smsButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    flex: 1,
  },
  smsButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  addressModalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    width: width * 0.9,
    maxHeight: '80%',
  },
  addressForm: {
    maxHeight: 400,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a202c',
    marginBottom: 6,
  },
  addressInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1a202c',
  },
  addressButtonsContainer: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  addressCancelButton: {
    backgroundColor: '#e2e8f0',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    flex: 1,
  },
  addressCancelButtonText: {
    color: '#718096',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  addressSaveButton: {
    backgroundColor: '#4A90E2',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    flex: 1,
  },
  addressSaveButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  paymentModalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    width: width * 0.9,
  },
  paymentModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a202c',
    textAlign: 'center',
    marginBottom: 20,
  },
  paymentAmountContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  paymentAmountLabel: {
    fontSize: 16,
    color: '#718096',
    marginBottom: 8,
  },
  paymentAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a202c',
  },
  cashInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1a202c',
    textAlign: 'center',
    marginBottom: 20,
  },
  paymentButtonsContainer: {
    flexDirection: 'row',
    gap: 10,
  },
  paymentCancelButton: {
    backgroundColor: '#e2e8f0',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    flex: 1,
  },
  paymentCancelButtonText: {
    color: '#718096',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  paymentConfirmButton: {
    backgroundColor: '#28a745',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    flex: 1,
  },
  paymentConfirmButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default Orders;