import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  getAuth,
  signOut
} from 'firebase/auth';
import {
  doc,
  onSnapshot,
  Unsubscribe,
  updateDoc
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db } from '../firebaseConfig'; // Adjust path as needed

interface AddressObject {
  street?: string;
  city?: string;
  state?: string;
  pincode?: string;
  formatted?: string;
}

interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string | AddressObject;
  city?: string;
  state?: string;
  zipCode?: string;
  profileImage?: string;
  dateOfBirth?: string;
  createdAt?: any;
  updatedAt?: any;
}

interface EditModalProps {
  visible: boolean;
  title: string;
  field: keyof UserProfile;
  value: string;
  onClose: () => void;
  onSave: (field: keyof UserProfile, value: string) => void;
  placeholder?: string;
  multiline?: boolean;
}

const EditModal: React.FC<EditModalProps> = ({
  visible,
  title,
  field,
  value,
  onClose,
  onSave,
  placeholder,
  multiline = false
}) => {
  const [inputValue, setInputValue] = useState(value);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const handleSave = () => {
    if (inputValue.trim()) {
      onSave(field, inputValue.trim());
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>
          
          <TextInput
            style={[
              styles.modalInput,
              multiline && styles.multilineInput
            ]}
            value={inputValue}
            onChangeText={setInputValue}
            placeholder={placeholder}
            multiline={multiline}
            numberOfLines={multiline ? 4 : 1}
            autoFocus
          />
          
          <View style={styles.modalButtons}>
            <TouchableOpacity 
              style={[styles.modalButton, styles.cancelButton]} 
              onPress={onClose}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.modalButton, styles.saveButton]} 
              onPress={handleSave}
            >
              <Text style={styles.saveButtonText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const ProfilePage: React.FC = () => {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [editModal, setEditModal] = useState<{
    visible: boolean;
    field: keyof UserProfile;
    title: string;
    placeholder?: string;
    multiline?: boolean;
  }>({
    visible: false,
    field: 'name',
    title: '',
  });

  const router = useRouter();
  const auth = getAuth();
  const currentUser = auth.currentUser;

  useEffect(() => {
    if (!currentUser) {
      router.replace('/(auth)/login'); // Update path to match your auth structure
      return;
    }

    // Set up real-time listener for user profile
    const userDocRef = doc(db, 'users', currentUser.uid);
    
    const unsubscribe: Unsubscribe = onSnapshot(
      userDocRef,
      (docSnapshot) => {
        if (docSnapshot.exists()) {
          const userData = docSnapshot.data() as Omit<UserProfile, 'id'>;
          setUserProfile({
            id: docSnapshot.id,
            ...userData,
          });
        } else {
          // Create initial profile if doesn't exist
          createInitialProfile();
        }
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching user profile:', error);
        setLoading(false);
        Alert.alert('Error', 'Failed to load profile data');
      }
    );

    // Also listen to auth state changes
    const authUnsubscribe = auth.onAuthStateChanged((user) => {
      if (!user) {
        // User is signed out, navigate to login
        router.replace('/(auth)/login');
      }
    });

    return () => {
      unsubscribe();
      authUnsubscribe();
    };
  }, [currentUser]);

  const createInitialProfile = async () => {
    if (!currentUser) return;

    const initialProfile = {
      name: currentUser.displayName || 'User',
      email: currentUser.email || '',
      phone: '',
      address: '',
      city: '',
      state: '',
      zipCode: '',
      profileImage: currentUser.photoURL || '',
      dateOfBirth: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    try {
      const userDocRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userDocRef, initialProfile);
    } catch (error) {
      console.error('Error creating initial profile:', error);
    }
  };

  const handleEditField = (
    field: keyof UserProfile, 
    title: string, 
    placeholder?: string,
    multiline?: boolean
  ) => {
    setEditModal({
      visible: true,
      field,
      title,
      placeholder,
      multiline,
    });
  };

  const handleSaveField = async (field: keyof UserProfile, value: string) => {
    if (!currentUser || !userProfile) return;

    setUpdating(true);
    try {
      const userDocRef = doc(db, 'users', currentUser.uid);
      
      // Handle different field types
      let updateData: any = {
        [field]: value,
        updatedAt: new Date(),
      };

      // If updating address and current address is an object, preserve structure
      if (field === 'address' && typeof userProfile.address === 'object') {
        updateData.address = {
          ...userProfile.address,
          formatted: value,
          street: value, // Also update street field
        };
      }

      await updateDoc(userDocRef, updateData);
      
      Alert.alert('Success', 'Profile updated successfully');
    } catch (error) {
      console.error('Error updating profile:', error);
      Alert.alert('Error', 'Failed to update profile');
    } finally {
      setUpdating(false);
    }
  };

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            setUpdating(true);
            try {
              // Clear any listeners or timers before signing out
              await signOut(auth);
              
              // Force navigation to login screen
              router.dismissAll();
              router.replace('/(auth)/login');
              
              // Alternative navigation options if above doesn't work:
              // router.push('/login');
              // or if using different route structure:
              // router.replace('/auth/login');
              
            } catch (error: any) {
              console.error('Error signing out:', error);
              
              // Show specific error message
              const errorMessage = error.message || 'Failed to sign out. Please try again.';
              Alert.alert(
                'Sign Out Error', 
                errorMessage,
                [
                  {
                    text: 'Retry',
                    onPress: () => handleSignOut(),
                  },
                  {
                    text: 'Force Sign Out',
                    style: 'destructive',
                    onPress: () => forceSignOut(),
                  }
                ]
              );
            } finally {
              setUpdating(false);
            }
          },
        },
      ]
    );
  };

  // Force sign out function for cases where normal sign out fails
  const forceSignOut = async () => {
    try {
      // Clear any local storage or cached data
      // Note: Don't use localStorage in React Native, but clear any AsyncStorage if you're using it
      
      // Force auth state to null
      await signOut(auth);
      
      // Force navigation
      router.dismissAll();
      router.replace('/(auth)/login');
      
    } catch (error) {
      console.error('Force sign out error:', error);
      // As last resort, just navigate away
      router.replace('/(auth)/login');
    }
  };

  // Helper function to format address
  const formatAddressValue = (address: string | AddressObject | undefined): string => {
    if (!address) return '';
    
    if (typeof address === 'string') {
      return address;
    }
    
    if (typeof address === 'object') {
      // If it has a formatted field, use that
      if (address.formatted) {
        return address.formatted;
      }
      
      // Otherwise, construct from parts
      const parts = [
        address.street,
        address.city,
        address.state,
        address.pincode
      ].filter(Boolean);
      
      return parts.join(', ');
    }
    
    return '';
  };

  // Helper function to get individual address field
  const getAddressField = (address: string | AddressObject | undefined, field: keyof AddressObject): string => {
    if (!address) return '';
    
    if (typeof address === 'object' && address[field]) {
      return address[field] || '';
    }
    
    return '';
  };

  const ProfileItem: React.FC<{
    icon: string;
    label: string;
    value: string | AddressObject | undefined;
    onPress: () => void;
    editable?: boolean;
    isAddress?: boolean;
  }> = ({ icon, label, value, onPress, editable = true, isAddress = false }) => {
    
    const displayValue = isAddress 
      ? formatAddressValue(value as string | AddressObject)
      : (typeof value === 'string' ? value : '');

    return (
      <TouchableOpacity 
        style={styles.profileItem} 
        onPress={onPress}
        disabled={!editable}
      >
        <View style={styles.profileItemLeft}>
          <Ionicons name={icon as any} size={20} color="#007AFF" />
          <View style={styles.profileItemText}>
            <Text style={styles.profileItemLabel}>{label}</Text>
            <Text style={styles.profileItemValue}>
              {displayValue || 'Not provided'}
            </Text>
          </View>
        </View>
        {editable && (
          <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!userProfile) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Failed to load profile</Text>
          <TouchableOpacity 
            style={styles.retryButton}
            onPress={() => setLoading(true)}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color="#007AFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Profile</Text>
          <TouchableOpacity 
            style={styles.signOutButton}
            onPress={handleSignOut}
          >
            <Ionicons name="log-out-outline" size={24} color="#FF3B30" />
          </TouchableOpacity>
        </View>

        {/* Profile Image and Basic Info */}
        <View style={styles.profileHeader}>
          <View style={styles.profileImageContainer}>
            {userProfile.profileImage ? (
              <Image 
                source={{ uri: userProfile.profileImage }} 
                style={styles.profileImage} 
              />
            ) : (
              <View style={styles.profileImagePlaceholder}>
                <Ionicons name="person" size={40} color="#C7C7CC" />
              </View>
            )}
            <TouchableOpacity 
              style={styles.editImageButton}
              onPress={() => {
                // Implement image picker functionality
                Alert.alert('Coming Soon', 'Image upload functionality will be added');
              }}
            >
              <Ionicons name="camera" size={16} color="#FFF" />
            </TouchableOpacity>
          </View>
          <Text style={styles.profileName}>{userProfile.name}</Text>
          <Text style={styles.profileEmail}>{userProfile.email}</Text>
        </View>

        {/* Profile Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personal Information</Text>
          
          <ProfileItem
            icon="person-outline"
            label="Full Name"
            value={userProfile.name}
            onPress={() => handleEditField('name', 'Edit Name', 'Enter your full name')}
          />
          
          <ProfileItem
            icon="call-outline"
            label="Phone Number"
            value={userProfile.phone || ''}
            onPress={() => handleEditField('phone', 'Edit Phone', 'Enter your phone number')}
          />
          
          <ProfileItem
            icon="calendar-outline"
            label="Date of Birth"
            value={userProfile.dateOfBirth || ''}
            onPress={() => handleEditField('dateOfBirth', 'Edit Date of Birth', 'MM/DD/YYYY')}
          />
          
          <ProfileItem
            icon="mail-outline"
            label="Email Address"
            value={userProfile.email}
            onPress={() => Alert.alert('Info', 'Email cannot be changed from here')}
            editable={false}
          />
        </View>

        {/* Address Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Address Information</Text>
          
          <ProfileItem
            icon="location-outline"
            label="Street Address"
            value={userProfile.address}
            onPress={() => handleEditField('address', 'Edit Address', 'Enter your street address', true)}
            isAddress={true}
          />
          
          <ProfileItem
            icon="business-outline"
            label="City"
            value={typeof userProfile.address === 'object' ? getAddressField(userProfile.address, 'city') : userProfile.city || ''}
            onPress={() => handleEditField('city', 'Edit City', 'Enter your city')}
          />
          
          <ProfileItem
            icon="map-outline"
            label="State"
            value={typeof userProfile.address === 'object' ? getAddressField(userProfile.address, 'state') : userProfile.state || ''}
            onPress={() => handleEditField('state', 'Edit State', 'Enter your state')}
          />
          
          <ProfileItem
            icon="mail-open-outline"
            label="ZIP Code"
            value={typeof userProfile.address === 'object' ? getAddressField(userProfile.address, 'pincode') : userProfile.zipCode || ''}
            onPress={() => handleEditField('zipCode', 'Edit ZIP Code', 'Enter your ZIP code')}
          />
        </View>

        {/* Account Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          
          <TouchableOpacity 
            style={styles.actionItem}
            onPress={() => {
              // Implement change password functionality
              Alert.alert('Coming Soon', 'Change password functionality will be added');
            }}
          >
            <View style={styles.profileItemLeft}>
              <Ionicons name="lock-closed-outline" size={20} color="#FF9500" />
              <Text style={styles.actionItemText}>Change Password</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.actionItem}
            onPress={handleSignOut}
          >
            <View style={styles.profileItemLeft}>
              <Ionicons name="log-out-outline" size={20} color="#FF3B30" />
              <Text style={[styles.actionItemText, { color: '#FF3B30' }]}>
                Sign Out
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Edit Modal */}
      <EditModal
        visible={editModal.visible}
        title={editModal.title}
        field={editModal.field}
        value={(() => {
          const fieldValue = userProfile[editModal.field];
          if (editModal.field === 'address' && typeof fieldValue === 'object') {
            return formatAddressValue(fieldValue);
          }
          return fieldValue as string || '';
        })()}
        onClose={() => setEditModal({ ...editModal, visible: false })}
        onSave={handleSaveField}
        placeholder={editModal.placeholder}
        multiline={editModal.multiline}
      />

      {/* Loading Overlay */}
      {updating && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Updating...</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  signOutButton: {
    padding: 4,
  },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 32,
    backgroundColor: '#FFF',
    marginBottom: 20,
  },
  profileImageContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  profileImagePlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editImageButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  profileName: {
    fontSize: 24,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 16,
    color: '#8E8E93',
  },
  section: {
    backgroundColor: '#FFF',
    marginBottom: 20,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E5E5EA',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#F2F2F7',
    textTransform: 'uppercase',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  profileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  profileItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  profileItemText: {
    marginLeft: 12,
    flex: 1,
  },
  profileItemLabel: {
    fontSize: 16,
    color: '#000',
    marginBottom: 2,
  },
  profileItemValue: {
    fontSize: 14,
    color: '#8E8E93',
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  actionItemText: {
    fontSize: 16,
    color: '#000',
    marginLeft: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 20,
    width: '90%',
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  closeButton: {
    padding: 4,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 20,
  },
  multilineInput: {
    height: 100,
    textAlignVertical: 'top',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#F2F2F7',
  },
  saveButton: {
    backgroundColor: '#007AFF',
  },
  cancelButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '500',
  },
  saveButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#8E8E93',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#FF3B30',
    marginBottom: 20,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
});

export default ProfilePage;